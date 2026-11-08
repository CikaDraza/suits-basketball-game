import assert from 'node:assert/strict';
import test from 'node:test';
import { Euler, Quaternion, SkinnedMesh, Vector3 } from 'three';
import { config } from '../src/game/data/gameConfig';
import {
  createBallHandlingState,
  protectedBallTarget,
  stepBallHandling,
} from '../src/game/simulation/ballHandling';
import { createHandContactPose } from '../src/game/entities/handContactPose';
import { loadCharacter } from './helpers/loadCharacter';

const BODY_Y = config.physics.halfHeight + config.physics.radius;
const RADIUS = config.ball.radius;
const distance = (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) =>
  Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

/** Use Character's rest-frame spine rotations and measured pelvis drop, not a rigid T-pose. */
function postRig(asset: Awaited<ReturnType<typeof loadCharacter>>) {
  const point = new Vector3();
  const hipHeight = asset.bones.Hips.getWorldPosition(point).y;
  const spine = ['Spine', 'Spine1', 'Spine2'].map((name) => ({
    bone: asset.bones[name],
    rest: asset.bones[name].quaternion.clone(),
    world: asset.bones[name].getWorldQuaternion(new Quaternion()),
  }));
  const lengths = ['Left', 'Right'].map((side) => {
    const upper = asset.bones[side + 'Arm'].getWorldPosition(new Vector3());
    const elbow = asset.bones[side + 'ForeArm'].getWorldPosition(new Vector3());
    const wrist = asset.bones[side + 'Hand'].getWorldPosition(new Vector3());
    return [upper.distanceTo(elbow), elbow.distanceTo(wrist)];
  });
  let hipHalfWidth = 0;
  asset.model.traverse((object) => {
    if (!(object instanceof SkinnedMesh)) return;
    const indices = object.geometry.getAttribute('skinIndex');
    const weights = object.geometry.getAttribute('skinWeight');
    if (!indices || !weights) return;
    for (let vertex = 0; vertex < indices.count; vertex++) {
      let torsoWeight = 0;
      for (let component = 0; component < 4; component++) {
        const bone = object.skeleton.bones[indices.getComponent(vertex, component)];
        if (bone && /(Hips|Spine\d*)$/.test(bone.name))
          torsoWeight += weights.getComponent(vertex, component);
      }
      if (torsoWeight < 0.8) continue;
      object.getVertexPosition(vertex, point).applyMatrix4(object.matrixWorld);
      if (point.y >= hipHeight - 0.2 && point.y <= hipHeight + 0.25)
        hipHalfWidth = Math.max(hipHalfWidth, Math.abs(point.x));
    }
  });
  return {
    hipHeight,
    hipHalfWidth,
    lengths,
    apply(body: { x: number; z: number }, angle: number, blend: number, lean = 0.38, brace = 0) {
      asset.reset();
      spine.forEach(({ bone, rest, world }, i) => {
        const rotation = new Quaternion().setFromEuler(
          new Euler((0.04 + (lean - 0.04) * blend) * (i === 0 ? 0.4 : 0.3), 0, 0),
        );
        bone.quaternion
          .copy(rest)
          .multiply(world.clone().invert().multiply(rotation).multiply(world));
      });
      const drop =
        config.animation.posture.uprightDrop +
        (config.animation.posture.postDrop - config.animation.posture.uprightDrop) * blend +
        brace;
      asset.model.position.set(body.x, -hipHeight * drop, body.z);
      asset.model.rotation.set(0, angle, 0);
      asset.model.updateMatrixWorld(true);
    },
  };
}

for (const legend of ['shaq', 'chuck'] as const) {
  test(`${legend}: protected dribble clears the measured hip and keeps both real arms reachable across post lean/brace at 20/30/60/120 Hz`, async (context) => {
    const asset = await loadCharacter(legend);
    context.after(asset.dispose);
    const rig = postRig(asset);
    const report: Record<string, unknown>[] = [];
    for (const rate of [20, 30, 60, 120])
      for (const hand of [1, -1])
        for (const lean of [0.24, 0.38, 0.52])
          for (const brace of [0, config.animation.posture.braceDrop]) {
            asset.reset();
            asset.model.position.set(0, 0, 0);
            asset.model.rotation.set(0, 0, 0);
            asset.model.updateMatrixWorld(true);
            const pose = createHandContactPose(asset.model, legend);
            const state = createBallHandlingState();
            const body = { x: 0, y: BODY_Y, z: 0 };
            let current = protectedBallTarget(legend, body, 0, true, { x: 0, y: 0, z: 0 });
            const floor = new Vector3(),
              ball = new Vector3(),
              normal = new Vector3();
            let maxError = 0,
              maxBehind = 0,
              minFacing = 1,
              minClearance = Infinity;
            let maxGap = 0,
              minBend = Infinity,
              maxBend = 0,
              minPalm = Infinity,
              maxPalm = -Infinity;
            let contacts = 0;
            for (let n = 0; n < rate * 3; n++) {
              const t = n / rate,
                dt = 1 / rate,
                angle = t * 0.35;
              body.x = t * 0.3;
              body.z = Math.sin(t) * 0.2;
              const c = Math.cos(angle),
                s = Math.sin(angle);
              const defender = { x: body.x - s, y: BODY_Y, z: body.z - c };
              current = {
                ...stepBallHandling(
                  state,
                  0,
                  legend,
                  body,
                  angle,
                  'dribble',
                  hand,
                  true,
                  0,
                  current,
                  dt,
                  defender,
                ),
              };
              pose.reset();
              rig.apply(body, angle, 1, lean, brace);
              ball.set(current.x, current.y, current.z);
              floor.set(body.x, 0, body.z);
              pose.update(ball, true, false, true, state, floor, angle, dt);
              assert.ok(current.y >= RADIUS - 1e-8);
              assert.equal(state.hand, hand, 'pressure cannot silently transfer the ball');
              if (t < 1.2) continue;
              const active = hand === 1 ? 0 : 1;
              const arm = pose.arms[active];
              const d = arm.debug;
              const shoulder = arm.upper.getWorldPosition(new Vector3());
              const elbow = arm.fore.getWorldPosition(new Vector3());
              const wrist = arm.hand.getWorldPosition(new Vector3());
              const behind = (shoulder.x - elbow.x) * s + (shoulder.z - elbow.z) * c;
              const clearance = Math.abs(state.local.x) - RADIUS - rig.hipHalfWidth;
              const where = `${legend} @${rate} hand=${hand} lean=${lean} brace=${brace} phase=${state.phase.toFixed(3)}`;
              minClearance = Math.min(minClearance, clearance);
              maxError = Math.max(maxError, d.error);
              maxBehind = Math.max(maxBehind, behind);
              minBend = Math.min(minBend, d.elbowBend);
              maxBend = Math.max(maxBend, d.elbowBend);
              minPalm = Math.min(minPalm, d.palm.y);
              maxPalm = Math.max(maxPalm, d.palm.y);
              assert.ok(clearance > 0.025, `${where}: ball within hip silhouette (${clearance})`);
              assert.ok(behind < 0.035, `${where}: elbow behind torso (${behind})`);
              assert.ok(d.error < 0.025, `${where}: unreachable palm (${d.error})`);
              assert.ok(d.wristBend <= 65.02 && d.elbowBend >= 24.99 && d.elbowBend <= 150.01);
              assert.ok(Math.abs(shoulder.distanceTo(elbow) - rig.lengths[active][0]) < 1e-5);
              assert.ok(Math.abs(elbow.distanceTo(wrist) - rig.lengths[active][1]) < 1e-5);
              if (state.phase < 0.07 || state.phase > 0.93) {
                contacts++;
                const gap = Math.abs(d.palm.distanceTo(ball) - RADIUS);
                const facing = normal.copy(ball).sub(d.palm).normalize().dot(d.normal);
                maxGap = Math.max(maxGap, gap);
                minFacing = Math.min(minFacing, facing);
                assert.ok(gap < 0.025, `${where}: missed surface (${gap})`);
                assert.ok(facing > 0.9, `${where}: palm facing (${facing})`);
              }
              if (state.phase > 0.35 && state.phase < 0.7)
                assert.ok(
                  d.palm.distanceTo(ball) - RADIUS > 0.1,
                  `${where}: hand follows ball to floor`,
                );
            }
            assert.ok(contacts > 2);
            assert.ok(
              maxPalm - minPalm > 0.18,
              'forearm push must remain visible throughout post dribbling',
            );
            assert.ok(
              maxBend - minBend > 12,
              `elbow must flex and extend ${rate} ${hand} ${lean} ${brace} ${minBend} ${maxBend}`,
            );
            report.push({
              rate,
              hand,
              lean,
              brace,
              maxError,
              maxBehind,
              minFacing,
              minClearance,
              maxGap,
              minBend,
              maxBend,
              palmRange: maxPalm - minPalm,
            });
          }
    context.diagnostic(
      JSON.stringify({
        hipHeight: rig.hipHeight,
        hipHalfWidth: rig.hipHalfWidth,
        armLengths: rig.lengths,
        cases: report,
      }),
    );
  });

  for (const bodyLag of [1, 0.45])
    test(`${legend}: pressure and post transitions preserve phase/continuity at body blend ${bodyLag}`, async (context) => {
      const asset = await loadCharacter(legend);
      context.after(asset.dispose);
      const rig = postRig(asset);
      const pose = createHandContactPose(asset.model, legend);
      const state = createBallHandlingState();
      const dt = 1 / 60,
        body = { x: 0, y: BODY_Y, z: 0 };
      const floor = new Vector3(),
        ball = new Vector3(),
        towardBall = new Vector3();
      let current = protectedBallTarget(legend, body, 0, false, { x: 0, y: 0, z: 0 });
      let bodyBlend = 0;
      let crossings = 0,
        wasCrossing = false,
        maxBallSpeed = 0,
        maxArmSpeed = 0,
        maxError = 0;
      const previousArm = pose.arms.map((a) => a.hand.quaternion.clone());
      const localPressure: { side: number; x: number; z: number; hand: number }[] = [];
      for (let n = 0; n < 60 * 10; n++) {
        const t = n * dt,
          post = t >= 1 && t < 7,
          requested = t < 4 ? 1 : -1;
        if (t >= 7) body.x = (t - 7) * 0.5;
        // Both sides are visited while the original hand is still selected.
        const defender = { x: body.x + (t < 2.5 ? -0.85 : 0.85), y: BODY_Y, z: -0.45 };
        const previous = { ...current },
          oldPhase = state.phase;
        current = {
          ...stepBallHandling(
            state,
            0,
            legend,
            body,
            0,
            'dribble',
            requested,
            post,
            0,
            current,
            dt,
            defender,
          ),
        };
        const expectedPhase = (oldPhase + dt / config.ballControl.period) % 1;
        assert.ok(
          Math.abs(state.phase - expectedPhase) < 1e-10,
          'post transitions preserve bounce clock',
        );
        if (state.crossing && !wasCrossing) crossings++;
        wasCrossing = state.crossing;
        bodyBlend += (Number(post) - bodyBlend) * (1 - Math.exp(-8 * bodyLag * dt));
        rig.apply(body, 0, bodyBlend);
        pose.reset();
        floor.set(body.x, 0, body.z);
        ball.set(current.x, current.y, current.z);
        pose.update(ball, true, false, true, state, floor, 0, dt);
        if (t > 0.7) {
          maxBallSpeed = Math.max(maxBallSpeed, distance(current, previous) / dt);
          const active = state.hand === 1 ? 0 : 1;
          const arm = pose.arms[active];
          if (arm.debug.weight > 0.98 && arm.debug.error > maxError) {
            maxError = arm.debug.error;
          }
          if (arm.debug.weight > 0.98 && (state.phase < 0.07 || state.phase > 0.93)) {
            assert.ok(
              Math.abs(arm.debug.palm.distanceTo(ball) - RADIUS) < 0.025,
              'the active palm contacts the ball through stance transitions',
            );
            assert.ok(
              towardBall.copy(ball).sub(arm.debug.palm).normalize().dot(arm.debug.normal) > 0.9,
              'the palm faces the ball through stance transitions',
            );
          }
          for (let i = 0; i < 2; i++) {
            const speed = previousArm[i].angleTo(pose.arms[i].hand.quaternion) / dt;
            maxArmSpeed = Math.max(maxArmSpeed, speed);
          }
        }
        pose.arms.forEach((a, i) => previousArm[i].copy(a.hand.quaternion));
        if (t >= 2 && t < 4) {
          assert.equal(state.hand, 1, 'defender changing sides must not select the other hand');
          if (n % 30 === 0)
            localPressure.push({
              side: Math.sign(defender.x - body.x),
              x: state.shape!.hipSide,
              z: state.shape!.dribbleForward,
              hand: state.hand,
            });
        }
      }
      assert.equal(crossings, 1);
      assert.equal(state.hand, -1, 'drive preserves receiving hand');
      assert.ok(localPressure.some((s) => s.side < 0) && localPressure.some((s) => s.side > 0));
      assert.ok(
        Math.max(...localPressure.map((s) => s.x)) - Math.min(...localPressure.map((s) => s.x)) >
          0.004,
        'spacing responds to defender',
      );
      assert.ok(maxBallSpeed < 10, 'no ball teleport on stance transition');

      assert.ok(maxError < 0.025, `reachable targets throughout transitions: ${maxError}`);
      assert.ok(maxArmSpeed < 25, `no abrupt arm twist through stance transitions: ${maxArmSpeed}`);
      context.diagnostic(JSON.stringify({ localPressure, maxBallSpeed, maxArmSpeed, maxError }));
    });
}

for (const legend of ['shaq', 'chuck'] as const)
  test(`${legend}: protective spacing increases separation from a close defender without selecting another hand`, () => {
    const body = { x: 0, y: BODY_Y, z: 0 };
    const profile = config.ballControl.postDribble[legend];
    for (const hand of [1, -1])
      for (const defender of [
        { x: hand * 0.8, z: -0.6 },
        { x: -hand * 0.8, z: -0.6 },
        { x: hand * 0.8, z: 0.6 },
        { x: hand * 0.6, z: 0.35 },
      ]) {
        const state = createBallHandlingState();
        let current = { x: 0, y: 1.2, z: 0 };
        for (let n = 0; n < 180; n++)
          current = {
            ...stepBallHandling(
              state,
              0,
              legend,
              body,
              0,
              'dribble',
              hand,
              true,
              0,
              current,
              1 / 60,
              defender,
            ),
          };
        const before = Math.hypot(
          hand * profile.hipSide - defender.x,
          profile.dribbleForward - defender.z,
        );
        const after = Math.hypot(current.x - defender.x, current.z - defender.z);
        assert.ok(
          after > before + 0.005,
          `spacing must move away from the defender: ${before} → ${after}`,
        );
        assert.equal(state.hand, hand);
        assert.equal(state.crossing, false);
        if (defender.z < 0) {
          const ordinary = config.ballControl[legend];
          const ordinaryDistance = Math.hypot(
            hand * ordinary.hipSide - defender.x,
            ordinary.dribbleForward - defender.z,
          );
          assert.ok(after > ordinaryDistance, 'post-up places the body between defender and ball');
        }
      }
  });
