import assert from 'node:assert/strict';
import test from 'node:test';
import { Quaternion, Vector3 } from 'three';
import { loadCharacter } from './helpers/loadCharacter';
import { createHandContactPose } from '../src/game/entities/handContactPose';
import { createDefensiveArmIK } from '../src/game/entities/defensiveArmIK';
import { palmFrame } from '../src/game/entities/palmSockets';

for (const legend of ['shaq', 'chuck'] as const) {
  test(`${legend}: entering and leaving the pole fallback cone cannot flip an arm or a constrained wrist`, async (context) => {
    const asset = await loadCharacter(legend);
    context.after(asset.dispose);
    const contacts = createHandContactPose(asset.model, legend);
    const maximum = [0, 0, 0];
    for (const [i, arm] of contacts.arms.entries()) {
      const solver = createDefensiveArmIK(arm);
      const pole = new Vector3((i === 0 ? 1 : -1) * 0.5, -0.3, 0.5).normalize();
      const perpendicular = new Vector3(0, 1, 0).projectOnPlane(pole).normalize();
      const normal = new Vector3(0, 0, 1),
        fingers = new Vector3(0, 1, 0);
      const rotation = palmFrame(normal, fingers, new Quaternion()).multiply(
        arm.socket.quaternion.clone().invert(),
      );
      const offset = arm.socket.position.clone().applyQuaternion(rotation);
      for (const flex of [5.1, 12]) {
        solver.reset();
        let previous: Quaternion[] | undefined,
          usedFallback = false;
        for (let n = 0; n <= 200; n++) {
          asset.reset();
          const direction = pole
            .clone()
            .addScaledVector(perpendicular, -0.2 + n * 0.002)
            .normalize();
          const target = arm.upper
            .getWorldPosition(new Vector3())
            .addScaledVector(direction, solver.reach(flex))
            .add(offset);
          solver.solve(target, normal, fingers, pole, 1, {
            minFlex: 5,
            maxFlex: 145,
            maxTwist: 85,
            maxWrist: 65,
          });
          const current = [arm.upper, arm.fore, arm.hand].map((b) => b.quaternion.clone());
          if (previous)
            current.forEach((q, j) => {
              const travel = q.angleTo(previous![j]);
              maximum[j] = Math.max(maximum[j], travel);
              assert.ok(
                travel < (j === 2 ? 0.15 : 0.03),
                `joint ${j} flipped at cone sample ${n}: ${travel}`,
              );
            });
          previous = current;
          usedFallback ||= solver.debug.poleFallback;
          assert.ok(solver.debug.elbowPlaneError < 0.1);
          assert.ok(Math.abs(solver.debug.elbowFlex - flex) < 0.01);
          assert.ok(solver.debug.wristBend <= 65.01);
          assert.ok(Math.abs(solver.debug.forearmTwist) <= 85.01);
        }
        assert.ok(usedFallback);
        assert.ok(
          solver.debug.poleProjection > 0.15,
          'the sweep must also leave the fallback cone',
        );
      }
    }
    context.diagnostic(
      `Maximum rotation per 0.002-radian target step (upper / forearm / wrist): ${maximum.map((a) => ((a * 180) / Math.PI).toFixed(4)).join(' / ')} degrees`,
    );
  });

  test(`${legend}: DEF-ARM-FIX-1A calibrated elbow plane, near-full defensive reach and palm orientation`, async (context) => {
    const asset = await loadCharacter(legend);
    context.after(asset.dispose);
    const contacts = createHandContactPose(asset.model, legend);
    const solvers = contacts.arms.map(createDefensiveArmIK);
    const records: unknown[] = [];
    for (const yaw of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
      const left = new Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
      const forward = new Vector3(Math.sin(yaw), 0, Math.cos(yaw));
      for (const [i, solver] of solvers.entries()) {
        for (const mode of ['lateral', 'overhead', 'guard'] as const) {
          asset.reset();
          asset.model.rotation.set(0, yaw, 0);
          asset.model.updateMatrixWorld(true);
          const sign = i === 0 ? 1 : -1;
          const origin = solver.arm.upper.getWorldPosition(new Vector3());
          const direction =
            mode === 'lateral'
              ? left.clone().multiplyScalar(sign).addScaledVector(forward, 0.12).normalize()
              : mode === 'overhead'
                ? new Vector3(0, 1, 0)
                    .addScaledVector(left, sign * 0.08)
                    .addScaledVector(forward, 0.03)
                    .normalize()
                : forward
                    .clone()
                    .multiplyScalar(0.7)
                    .addScaledVector(left, -sign * 0.05)
                    .setY(-0.2)
                    .normalize();
          const flex = mode === 'lateral' ? 12 : mode === 'overhead' ? 8 : 95;
          const wristTarget = origin.clone().addScaledVector(direction, solver.reach(flex));
          const fingers =
            mode === 'lateral'
              ? left.clone().multiplyScalar(sign)
              : mode === 'guard'
                ? new Vector3(0, 0.6, 0).addScaledVector(forward, 0.8)
                : new Vector3(0, 1, 0);
          const normal =
            mode === 'guard'
              ? left.clone().multiplyScalar(-sign).addScaledVector(forward, 0.2).normalize()
              : forward;
          const q = palmFrame(normal, fingers, new Quaternion()).multiply(
            solver.arm.socket.quaternion.clone().invert(),
          );
          const palmTarget = wristTarget
            .clone()
            .add(solver.arm.socket.position.clone().applyQuaternion(q));
          const pole =
            mode === 'lateral'
              ? new Vector3(0, -1, 0).addScaledVector(forward, 0.05)
              : mode === 'overhead'
                ? left.clone().multiplyScalar(sign).addScaledVector(forward, 0.1)
                : left
                    .clone()
                    .multiplyScalar(sign * 0.25)
                    .addScaledVector(forward, -0.1)
                    .setY(-1);
          solver.solve(palmTarget, normal, fingers, pole, 1, {
            minFlex: 5,
            maxFlex: 145,
            maxTwist: 80,
            maxWrist: 45,
          });
          const d = solver.debug;
          assert.ok(d.elbowPlaneError < 0.1, `${mode} ${i}: elbow plane ${d.elbowPlaneError}°`);
          assert.ok(
            Math.abs(d.elbowFlex - flex) < 1,
            `${mode} ${i}: actual flex ${d.elbowFlex}° instead of ${flex}°; twist ${d.forearmTwist}, wrist ${d.wristBend}, error ${d.contactError}`,
          );
          assert.ok(d.contactError < 0.005, `${mode} ${i}: palm target error ${d.contactError}`);
          assert.ok(solver.arm.debug.normal.dot(normal) > 0.97, `${mode} palm orientation`);
          assert.ok(
            Math.abs(d.forearmTwist) < 75,
            `${mode} excessive forearm twist ${d.forearmTwist}`,
          );
          assert.ok(d.wristBend < 35, `${mode} excessive wrist bend ${d.wristBend}`);
          const actualUpper = d.shoulder.distanceTo(d.elbow),
            actualFore = d.elbow.distanceTo(d.wrist);
          assert.ok(Math.abs(actualUpper - solver.upperLength) < 1e-5);
          assert.ok(Math.abs(actualFore - solver.foreLength) < 1e-5);
          records.push({
            yaw,
            side: i,
            mode,
            flex: d.elbowFlex,
            plane: d.elbowPlaneError,
            twist: d.forearmTwist,
            wrist: d.wristBend,
            error: d.contactError,
          });
        }
      }
    }
    assert.equal(records.length, 24);
  });

  test(`${legend}: DEF-ARM-FIX-1A pole singularities preserve bend continuity and unreachable targets preserve bone lengths`, async (context) => {
    const asset = await loadCharacter(legend);
    context.after(asset.dispose);
    const contacts = createHandContactPose(asset.model, legend);
    for (const [i, arm] of contacts.arms.entries()) {
      const solver = createDefensiveArmIK(arm);
      const sign = i === 0 ? 1 : -1,
        pole = new Vector3(sign * 0.5, -0.3, 0.5).normalize();
      const normal = new Vector3(0, 0, 1),
        fingers = new Vector3(0, 1, 0);
      const q = palmFrame(normal, fingers, new Quaternion()).multiply(
        arm.socket.quaternion.clone().invert(),
      );
      const offset = arm.socket.position.clone().applyQuaternion(q);
      for (const flex of [5.1, 12]) {
        let previous: Quaternion[] | null = null;
        for (const epsilon of [-1e-4, -1e-6, 0, 1e-6, 1e-4]) {
          asset.reset();
          const origin = arm.upper.getWorldPosition(new Vector3());
          const direction = pole
            .clone()
            .add(new Vector3(0, epsilon, 0))
            .normalize();
          const target = origin.addScaledVector(direction, solver.reach(flex)).add(offset);
          solver.solve(target, normal, fingers, pole, 1, {
            minFlex: 5,
            maxFlex: 145,
            maxTwist: 85,
            maxWrist: 65,
          });
          const current = [arm.upper, arm.fore, arm.hand].map((b) => b.quaternion.clone());
          assert.ok(
            current.every((q) => Number.isFinite(q.length()) && Math.abs(q.length() - 1) < 1e-5),
          );
          if (previous)
            current.forEach((q, j) =>
              assert.ok(q.angleTo(previous![j]) < 0.03, `joint ${j} flips at epsilon ${epsilon}`),
            );
          previous = current;
          assert.ok(
            solver.debug.poleFallback,
            'the singular pole must exercise the calibrated fallback',
          );
          assert.ok(solver.debug.elbowPlaneError < 0.1);
        }
      }
      asset.reset();
      const origin = arm.upper.getWorldPosition(new Vector3());
      solver.solve(
        origin.addScaledVector(new Vector3(sign, 0, 0), solver.length * 1.2).add(offset),
        normal,
        fingers,
        new Vector3(0, -1, 0),
        1,
        { minFlex: 8, maxFlex: 145, maxTwist: 85, maxWrist: 65 },
      );
      assert.ok(solver.debug.elbowFlex >= 7.99);
      assert.ok(solver.debug.shoulder.distanceTo(solver.debug.wrist) <= solver.reach(8) + 1e-5);
      assert.ok(
        Math.abs(solver.debug.shoulder.distanceTo(solver.debug.elbow) - solver.upperLength) < 1e-5,
      );
      assert.ok(
        Math.abs(solver.debug.elbow.distanceTo(solver.debug.wrist) - solver.foreLength) < 1e-5,
      );
    }
  });
}
