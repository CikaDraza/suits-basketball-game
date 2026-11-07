import assert from 'node:assert/strict';
import test from 'node:test';
import { Bone, Quaternion, SkinnedMesh, Vector3 } from 'three';
import { loadCharacter } from './helpers/loadCharacter';
import { createHandContactPose } from '../src/game/entities/handContactPose';
import { createBallHandlingState } from '../src/game/simulation/ballHandling';
import { createArmContact } from '../src/game/entities/armContact';
import { PALM_CALIBRATION } from '../src/game/entities/palmSockets';
import { config } from '../src/game/data/gameConfig';

for (const legend of ['shaq', 'chuck'] as const) {
  test(`${legend}: actual rig sockets contact the ball with bounded wrists/elbows, independent clones and no transition drift`, async (context) => {
    const asset = await loadCharacter(legend);
    context.after(asset.dispose);
    const secondBones = new Set<Bone>();
    asset.second.traverse((o) => {
      if (o instanceof Bone) secondBones.add(o);
    });
    assert.ok(Object.values(asset.bones).every((b) => !secondBones.has(b)));
    assert.deepEqual(
      asset.clips.map((c) => c.name),
      ['FaceDemo'],
    );
    const arms = (['Left', 'Right'] as const).map((side) =>
      createArmContact(
        asset.bones[side + 'Arm'],
        asset.bones[side + 'ForeArm'],
        asset.bones[side + 'Hand'],
        legend,
        side,
      ),
    );
    const bodyMesh: SkinnedMesh[] = [];
    asset.model.traverse((o) => {
      if (o instanceof SkinnedMesh && o.geometry.getAttribute('skinIndex')) bodyMesh.push(o);
    });
    const handEdges: { mesh: SkinnedMesh; a: number; b: number; length: number }[] = [];
    const v = new Vector3(),
      w = new Vector3();
    asset.model.updateMatrixWorld(true);
    for (const mesh of bodyMesh) {
      const idx = mesh.geometry.index,
        skin = mesh.geometry.getAttribute('skinIndex'),
        weights = mesh.geometry.getAttribute('skinWeight');
      if (!idx) continue;
      const hand = new Set(mesh.skeleton.bones.map((b, i) => (/Hand/.test(b.name) ? i : -1)));
      const selected = (n: number) => {
        for (let c = 0; c < 4; c++)
          if (weights.getComponent(n, c) > 0.2 && hand.has(skin.getComponent(n, c))) return true;
        return false;
      };
      for (let i = 0; i < idx.count; i += 3) {
        const ids = [idx.getX(i), idx.getX(i + 1), idx.getX(i + 2)];
        for (let j = 0; j < 3; j++) {
          const a = ids[j],
            b = ids[(j + 1) % 3];
          if (!selected(a) || !selected(b)) continue;
          mesh.getVertexPosition(a, v);
          mesh.getVertexPosition(b, w);
          handEdges.push({ mesh, a, b, length: v.distanceTo(w) });
        }
      }
    }
    const lengths = arms.map((a) => [
      a.upper.getWorldPosition(v).distanceTo(a.fore.getWorldPosition(w)),
      a.fore.getWorldPosition(v).distanceTo(a.hand.getWorldPosition(w)),
    ]);
    let maxGrowth = 0,
      maxContactError = 0;
    const first: Quaternion[][] = [];
    for (let cycle = 0; cycle < 24; cycle++) {
      asset.reset();
      asset.model.rotation.y = ((cycle % 6) * Math.PI) / 3;
      asset.model.position.set(2, 0, -3);
      asset.model.updateMatrixWorld(true);
      const forward = new Vector3(
          Math.sin(asset.model.rotation.y),
          0,
          Math.cos(asset.model.rotation.y),
        ),
        left = new Vector3(forward.z, 0, -forward.x);
      const dribbling = cycle % 2 === 1,
        shape = config.ballControl[legend];
      for (let i = 0; i < arms.length; i++) {
        const arm = arms[i],
          sign = i === 0 ? 1 : -1;
        const normal = dribbling
          ? new Vector3(0, -1, 0)
          : left
              .clone()
              .multiplyScalar(sign * 0.9)
              .addScaledVector(forward, 0.35)
              .setY(-0.1)
              .normalize();
        const target = dribbling
          ? new Vector3(2, shape.dribbleTop + config.ball.radius, -3)
              .addScaledVector(left, sign * shape.hipSide)
              .addScaledVector(forward, shape.dribbleForward)
          : new Vector3(2, shape.holdHeight, -3)
              .addScaledVector(forward, shape.holdForward)
              .addScaledVector(normal, config.ball.radius);
        if (!dribbling) normal.negate();
        const pole = left
          .clone()
          .multiplyScalar(sign * (dribbling ? 1 : 0.6))
          .addScaledVector(forward, dribbling ? 0.3 : 0.1)
          .setY(dribbling ? -0.1 : -1);
        arm.solve(target, normal, dribbling ? forward : new Vector3(0, 1, 0), pole, 1);
        maxContactError = Math.max(maxContactError, arm.debug.error);
        assert.ok(arm.debug.error < 0.018, `Palm contact error ${arm.debug.error}`);
        assert.ok(arm.debug.wristBend <= 65.01);
        assert.ok(arm.debug.elbowBend >= 25 - 1e-3 && arm.debug.elbowBend <= 150 + 1e-3);
        assert.ok(arm.debug.normal.dot(normal) > 0.95);
        assert.ok(
          Math.abs(
            arm.upper.getWorldPosition(v).distanceTo(arm.fore.getWorldPosition(w)) - lengths[i][0],
          ) < 1e-6,
        );
        assert.ok(
          Math.abs(
            arm.fore.getWorldPosition(v).distanceTo(arm.hand.getWorldPosition(w)) - lengths[i][1],
          ) < 1e-6,
        );
        if (cycle < 6) first[cycle] ??= [];
        if (cycle < 6) first[cycle][i] = arm.hand.quaternion.clone();
        else
          assert.ok(
            first[cycle % 6][i].angleTo(arm.hand.quaternion) < 1e-5,
            `Drift cycle ${cycle}: ${first[cycle % 6][i].angleTo(arm.hand.quaternion)}`,
          );
        assert.deepEqual(
          arm.socket.position.toArray(),
          PALM_CALIBRATION[legend][i === 0 ? 'Left' : 'Right'].position,
        );
      }
      asset.model.updateMatrixWorld(true);
      for (const edge of handEdges) {
        edge.mesh.getVertexPosition(edge.a, v);
        edge.mesh.getVertexPosition(edge.b, w);
        maxGrowth = Math.max(maxGrowth, v.distanceTo(w) - edge.length);
      }
    }
    assert.ok(maxGrowth < 0.05, `Hand triangles stretched ${maxGrowth} m`);
    const fpsResults = [];
    for (const rate of [30, 60, 120]) {
      asset.reset();
      asset.model.rotation.set(0, 0, 0);
      asset.model.position.set(0, 0, 0);
      asset.model.updateMatrixWorld(true);
      const contact = createHandContactPose(asset.model, legend),
        state = createBallHandlingState();
      const shape = config.ballControl[legend],
        ball = new Vector3(0, shape.holdHeight, shape.holdForward),
        floor = new Vector3();
      for (let frame = 0; frame < rate; frame++) {
        asset.reset();
        contact.reset();
        contact.update(ball, true, false, false, state, floor, 0, 1 / rate);
      }
      fpsResults.push(contact.arms.map((a) => a.hand.quaternion.clone()));
      assert.ok(contact.arms.every((a) => a.debug.error < 0.002));
    }
    for (const result of fpsResults)
      for (let i = 0; i < 2; i++)
        assert.ok(result[i].angleTo(fpsResults[0][i]) < 1e-5, 'Frame-rate-dependent hand drift');
    context.diagnostic(
      JSON.stringify({ maxContactError, maxHandEdgeGrowth: maxGrowth, poses: 24 }),
    );
  });
}
