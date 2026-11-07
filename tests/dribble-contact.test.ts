import assert from 'node:assert/strict';
import test from 'node:test';
import { Vector3 } from 'three';
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
