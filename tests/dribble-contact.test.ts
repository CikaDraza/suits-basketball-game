import assert from 'node:assert/strict';
import test from 'node:test';
import { Vector3, type Quaternion } from 'three';
import { loadCharacter } from './helpers/loadCharacter';
import { config } from '../src/game/data/gameConfig';
import { createHandContactPose } from '../src/game/entities/handContactPose';
import {
  createBallHandlingState,
  protectedBallTarget,
  stepBallHandling,
} from '../src/game/simulation/ballHandling';

/*
 * Deterministic dribble-contact check on the real rigs (no browser, no frame luck):
 * the body walks a curve while turning, dribbles left, crosses to the right, crosses back.
 * At every top of the bounce the ACTIVE palm must touch the ball surface and face it,
 * and the other hand must have let go — at slow (20 Hz) and fast step rates alike.
 */
const R = config.ball.radius;
const BODY_Y = config.physics.halfHeight + config.physics.radius; // capsule resting on the floor
/** |phase| from the top of the bounce inside which the palm must be on the ball. */
const TOP_WINDOW = 0.07;
const CONTACT_TOLERANCE = 0.02;

for (const legend of ['shaq', 'chuck'] as const) {
  test(`${legend}: dribble keeps palm contact at every bounce top and hands over cleanly on crossovers, while moving, at 20/30/60/120 Hz`, async (context) => {
    const asset = await loadCharacter(legend);
    context.after(asset.dispose);
    const report: Record<string, unknown>[] = [];
    for (const rate of [20, 30, 60, 120]) {
      asset.reset();
      const contact = createHandContactPose(asset.model, legend);
      const state = createBallHandlingState();
      const dt = 1 / rate;
      const body = { x: 5, y: BODY_Y, z: 0 };
      const ball = new Vector3(),
        floor = new Vector3(),
        toBall = new Vector3();
      let current = protectedBallTarget(legend, body, 0, false, { x: 0, y: 0, z: 0 });
      const tops = { left: 0, right: 0 };
      let worstGap = 0,
        worstFacing = 1,
        minActiveWeight = 1,
        maxIdleWeight = 0,
        crossings = 0,
        wasCrossing = false;
      for (let step = 0; step * dt < 5; step++) {
        const t = step * dt;
        // walk a gentle S-curve and face the direction of travel (turning body)
        const vx = -1.1,
          vz = 0.9 * Math.cos(t * 1.4);
        body.x += vx * dt;
        body.z += vz * dt;
        const angle = Math.atan2(vx, vz);
        const mode = t < 0.3 ? 'hold' : 'dribble';
        const requestedHand = t < 1.8 ? 1 : t < 3.4 ? -1 : 1;
        current = {
          ...stepBallHandling(
            state,
            0,
            legend,
            body,
            angle,
            mode,
            requestedHand,
            false,
            0,
            current,
            dt,
          ),
        };
        if (state.crossing && !wasCrossing) crossings++;
        wasCrossing = state.crossing;
        asset.reset();
        contact.reset();
        asset.model.position.set(body.x, body.y - BODY_Y, body.z);
        asset.model.rotation.set(0, angle, 0);
        asset.model.updateMatrixWorld(true);
        ball.set(current.x, current.y, current.z);
        floor.set(body.x, body.y - BODY_Y, body.z);
        contact.update(ball, true, false, mode === 'dribble', state, floor, angle, dt);

        assert.ok(current.y >= R - 1e-8, `ball below the floor at ${t.toFixed(2)} s`);
        const atTop = state.phase < TOP_WINDOW || state.phase > 1 - TOP_WINDOW;
        // skip the hold→dribble blend; afterwards every top must be a real touch
        if (mode !== 'dribble' || t < 0.3 + config.ballControl.transitionTime * 2 || !atTop)
          continue;
        const activeIndex = state.hand === 1 ? 0 : 1;
        const active = contact.arms[activeIndex].debug,
          idle = contact.arms[1 - activeIndex].debug;
        const gap = Math.abs(active.palm.distanceTo(ball) - R);
        const facing = toBall.copy(ball).sub(active.palm).normalize().dot(active.normal);
        worstGap = Math.max(worstGap, gap);
        worstFacing = Math.min(worstFacing, facing);
        minActiveWeight = Math.min(minActiveWeight, active.weight);
        maxIdleWeight = Math.max(maxIdleWeight, idle.weight);
        const where = `${legend} @${rate}Hz t=${t.toFixed(2)} phase=${state.phase.toFixed(3)} hand=${state.hand}`;
        assert.ok(
          gap < CONTACT_TOLERANCE,
          `${where}: palm ${gap.toFixed(3)} m off the ball surface`,
        );
        assert.ok(facing > 0.9, `${where}: palm not facing the ball (${facing.toFixed(3)})`);
        assert.ok(
          active.weight > 0.9,
          `${where}: active arm only ${active.weight.toFixed(2)} engaged`,
        );
        assert.ok(idle.weight < 0.1, `${where}: released hand still at ${idle.weight.toFixed(2)}`);
        assert.ok(active.wristBend <= 65.01, `${where}: wrist ${active.wristBend.toFixed(1)}°`);
        if (state.hand === 1) tops.left++;
        else tops.right++;
      }
      // both crossovers happened and each hand owned at least two bounce tops
      assert.equal(crossings, 2, `${legend} @${rate}Hz crossings`);
      assert.equal(state.hand, 1, `${legend} @${rate}Hz ends back in the left hand`);
      assert.ok(
        tops.left >= 2 && tops.right >= 2,
        `${legend} @${rate}Hz tops ${JSON.stringify(tops)}`,
      );
      report.push({ rate, tops, worstGap, worstFacing, minActiveWeight, maxIdleWeight });
    }
    context.diagnostic(JSON.stringify(report));
  });
}

// A top-contact test alone accepts a frozen arm. Measure the actual rig throughout
// repeated cycles, in both body frames, before accepting the push/release/recovery.
for (const legend of ['shaq', 'chuck'] as const) {
  test(`${legend}: the whole dribble cycle moves the palm and elbow, releases the ball and recovers without pose jumps`, async (context) => {
    const asset = await loadCharacter(legend);
    context.after(asset.dispose);
    const floor = new Vector3(),
      ball = new Vector3(),
      towards = new Vector3(),
      shoulder = new Vector3(),
      elbow = new Vector3();
    for (const rate of [20, 30, 60, 120])
      for (const hand of [1, -1])
        for (const moving of [false, true]) {
          asset.reset();
          const pose = createHandContactPose(asset.model, legend);
          const state = createBallHandlingState();
          state.hand = hand;
          const arm = pose.arms[hand === 1 ? 0 : 1];
          const previous = [arm.upper, arm.fore, arm.hand].map((b) => b.quaternion.clone());
          const cycles = new Map<
            number,
            { y: number[]; elbow: number[]; push: number[]; recover: number[] }
          >();
          let maxGap = 0,
            maxError = 0,
            maxAngularSpeed = 0,
            maxPalmSpeed = 0,
            maxElbowOutward = 0,
            minFreeGap = Infinity;
          const previousPalm = new Vector3();
          let current = protectedBallTarget(legend, { x: 0, y: BODY_Y, z: 0 }, 0, false, {
            x: 0,
            y: 0,
            z: 0,
          });
          for (let n = 0; n < rate * 4; n++) {
            const dt = 1 / rate,
              time = n * dt;
            const angle = moving ? time * 0.6 : 0;
            const body = {
              x: moving ? time * 0.7 : 0,
              y: BODY_Y,
              z: moving ? Math.sin(time) * 0.4 : 0,
            };
            current = {
              ...stepBallHandling(
                state,
                0,
                legend,
                body,
                angle,
                'dribble',
                hand,
                false,
                0,
                current,
                dt,
              ),
            };
            asset.reset();
            pose.reset();
            asset.model.position.set(body.x, 0, body.z);
            asset.model.rotation.set(0, angle, 0);
            asset.model.updateMatrixWorld(true);
            floor.set(body.x, 0, body.z);
            ball.set(current.x, current.y, current.z);
            pose.update(ball, true, false, true, state, floor, angle, dt);
            const d = arm.debug;
            if (time > 0.8) {
              const cycle = Math.floor((time + dt) / config.ballControl.period);
              const row = cycles.get(cycle) ?? { y: [], elbow: [], push: [], recover: [] };
              cycles.set(cycle, row);
              row.y.push(d.palm.y);
              row.elbow.push(d.elbowBend);
              if (state.phase < 0.13) row.push.push(d.palm.y);
              if (state.phase > 0.55 && state.phase < 0.94) row.recover.push(d.palm.y);
              const gap = d.palm.distanceTo(ball) - R;
              const where = `${legend} ${hand} @${rate} moving=${moving} phase=${state.phase.toFixed(3)}`;
              if (state.phase < 0.1 || state.phase > 0.94) {
                maxGap = Math.max(maxGap, Math.abs(gap));
                assert.ok(Math.abs(gap) < 0.02, `${where} push/catch contact gap ${gap}`);
                assert.ok(
                  towards.copy(ball).sub(d.palm).normalize().dot(d.normal) > 0.9,
                  `${where} palm orientation`,
                );
              }
              if (state.phase > 0.35 && state.phase < 0.7) minFreeGap = Math.min(minFreeGap, gap);
              assert.ok(gap > -0.015, `${where} ball penetration ${gap}`);
              assert.ok(
                d.palm.y > config.player[legend].height * 0.47,
                `${where} hand chases ball toward floor`,
              );
              maxError = Math.max(maxError, d.error);
              // Measure in the turning body's lateral frame. An elbow pole can
              // keep perfect palm contact while flaring the upper arm sideways.
              arm.upper.getWorldPosition(shoulder);
              arm.fore.getWorldPosition(elbow).sub(shoulder);
              const outward = hand * (elbow.x * Math.cos(angle) - elbow.z * Math.sin(angle));
              maxElbowOutward = Math.max(maxElbowOutward, outward);
              maxPalmSpeed = Math.max(maxPalmSpeed, previousPalm.distanceTo(d.palm) / dt);
              [arm.upper, arm.fore, arm.hand].forEach((b, i) => {
                maxAngularSpeed = Math.max(maxAngularSpeed, previous[i].angleTo(b.quaternion) / dt);
              });
              assert.ok(d.elbowBend >= 24.99 && d.elbowBend <= 150.01);
              assert.ok(d.wristBend <= 65.01);
            }
            previousPalm.copy(d.palm);
            [arm.upper, arm.fore, arm.hand].forEach((b, i) => previous[i].copy(b.quaternion));
          }
          const complete = [...cycles.values()].filter(
            (c) =>
              c.push.length >= 2 &&
              c.recover.length >= 3 &&
              c.y.length >= rate * config.ballControl.period * 0.8,
          );
          const range = (a: number[]) => Math.max(...a) - Math.min(...a);
          const palmRange = Math.min(...complete.map((c) => range(c.y)));
          const elbowRange = Math.min(...complete.map((c) => range(c.elbow)));
          const extensionBend = Math.max(...complete.map((c) => Math.min(...c.elbow)));
          const catchBend = Math.min(...complete.map((c) => Math.max(...c.elbow)));
          const result = {
            rate,
            hand,
            moving,
            cycles: complete.length,
            palmRange,
            elbowRange,
            extensionBend,
            catchBend,
            maxGap,
            maxError,
            maxAngularSpeed,
            maxPalmSpeed,
            maxElbowOutward,
            minFreeGap,
          };
          context.diagnostic(JSON.stringify(result));
          assert.ok(complete.length >= 3, 'at least three complete measured cycles');
          assert.ok(palmRange > 0.18, `insufficient palm push: ${JSON.stringify(result)}`);
          assert.ok(elbowRange > 12, `frozen elbow: ${JSON.stringify(result)}`);
          assert.ok(extensionBend < 40, `arm never comfortably extends: ${JSON.stringify(result)}`);
          assert.ok(maxElbowOutward < 0.15, `flared dribble elbow: ${JSON.stringify(result)}`);
          assert.ok(minFreeGap > 0.1, 'released palm stays separate from the free bounce');
          assert.ok(maxError < 0.02, 'targets remain reachable within existing joint limits');
          assert.ok(maxPalmSpeed < 4, 'bounded palm speed through the cycle');
          assert.ok(maxAngularSpeed < 25, 'no arm quaternion jumps through the cycle');
          for (const c of complete) {
            assert.ok(c.push[0] > c.push.at(-1)! + 0.015, 'palm pushes down');
            assert.ok(c.recover[0] + 0.03 < c.recover.at(-1)!, 'palm recovers upward');
          }
        }
  });
}

for (const legend of ['shaq', 'chuck'] as const) {
  test(`${legend}: repeated hold, dribble and crossover transitions return to the same hand pose`, async (context) => {
    const asset = await loadCharacter(legend);
    context.after(asset.dispose);
    const pose = createHandContactPose(asset.model, legend);
    const state = createBallHandlingState();
    const body = { x: 0, y: BODY_Y, z: 0 };
    const floor = new Vector3(),
      ball = new Vector3();
    let current = protectedBallTarget(legend, body, 0, false, { x: 0, y: 0, z: 0 });
    const dt = 1 / 60;
    const saved: Quaternion[] = [];
    for (let cycle = 0; cycle < 8; cycle++) {
      for (let frame = 0; frame < 240; frame++) {
        const dribbling = frame < 150;
        current = {
          ...stepBallHandling(
            state,
            0,
            legend,
            body,
            0,
            dribbling ? 'dribble' : 'hold',
            frame < 65 ? 1 : -1,
            false,
            0,
            current,
            dt,
          ),
        };
        asset.reset();
        pose.reset();
        ball.set(current.x, current.y, current.z);
        pose.update(ball, true, false, dribbling, state, floor, 0, dt);
        if (frame === 239)
          for (const arm of pose.arms) {
            assert.ok(
              Math.abs(arm.debug.palm.distanceTo(ball) - R) < 0.02,
              'hold re-established after release',
            );
            for (const bone of [arm.upper, arm.fore, arm.hand]) {
              const index =
                pose.arms.indexOf(arm) * 3 + [arm.upper, arm.fore, arm.hand].indexOf(bone);
              if (cycle === 0) saved[index] = bone.quaternion.clone();
              else
                assert.ok(
                  saved[index].angleTo(bone.quaternion) < 1e-4,
                  `pose drift after transition ${cycle}`,
                );
            }
          }
      }
    }
  });
}
