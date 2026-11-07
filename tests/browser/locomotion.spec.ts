import { writeFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import config from '../../src/game/data/game-config.json' with { type: 'json' };
import { createMovementTransform } from '../../src/game/simulation/coordinates';
import type { CharacterPoseSnapshot } from '../../src/game/harness/characterPose';
import type { LocomotionSnapshot } from '../../src/game/entities/locomotionDebug';
import { bootGame } from './helpers';

/*
 * Slice 3 acceptance: state-driven posture and world-anchored stepping on both real rigs,
 * at the default and a throttled (20 Hz) render rate. Every rendered frame is checked:
 * shoe soles (CPU-skinned) never below the court, a foot is only off the court while the
 * gait swings it, planted feet do not slide, and a backpedal never swings a foot forward.
 */
const movement = createMovementTransform(
  Math.atan2(
    config.camera.position[0] - config.camera.target[0],
    config.camera.position[2] - config.camera.target[2],
  ),
);
type Frame = {
  t: number;
  x: number;
  z: number;
  angle: number;
  mode: string;
  pose: CharacterPoseSnapshot;
  gait: LocomotionSnapshot;
  opponent: LocomotionSnapshot | null;
};

async function record(page: Page, seconds: number): Promise<Frame[]> {
  return page.evaluate(async (seconds) => {
    const out: Frame[] = [];
    const until = (window.__TEST__!.getState().time as number) + seconds;
    while ((window.__TEST__!.getState().time as number) < until || out.length < 6) {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const s = window.__TEST__!.getState();
      const player = s.player as { x: number; z: number; angle: number; mode: string };
      const pose = window.__TEST__!.getCharacterPose!(0),
        gait = window.__TEST__!.getLocomotion!(0);
      if (!pose || !gait) continue;
      out.push({
        t: s.time as number,
        x: player.x,
        z: player.z,
        angle: player.angle,
        mode: player.mode,
        pose,
        gait,
        opponent: window.__TEST__!.getLocomotion!(1),
      });
    }
    return out;
  }, seconds);
}
const move = (page: Page, dx: number, dz: number) =>
  page.evaluate(
    (s) => window.__TEST__!.setInput({ moveX: s.x, moveZ: s.z }),
    dx === 0 && dz === 0 ? { x: 0, z: 0 } : movement.worldToStick(dx, dz),
  );
async function settle(page: Page, seconds: number) {
  const from = (await page.evaluate(() => window.__TEST__!.getState().time)) as number;
  await expect
    .poll(() => page.evaluate(() => window.__TEST__!.getState().time as number))
    .toBeGreaterThan(from + seconds);
}
async function tapQ(page: Page) {
  await page.evaluate(() => window.__TEST__!.setInput({ actionB: true }));
  await settle(page, 0.1);
  await page.evaluate(() => window.__TEST__!.setInput({ actionB: false }));
}

const SOLE_FLOOR = -0.012,
  SOLE_CONTACT = 0.025;
/** Grounding + stance-slide + backpedal checks for one recorded segment. */
function checkFrames(label: string, frames: Frame[], report: Record<string, unknown>) {
  let slide = 0,
    travel = 0,
    forwardSwingWhileBack = 0;
  const worst: { slide: number; t: number; body: number; speed: number; moving: boolean }[] = [];
  for (let k = 0; k < frames.length; k++) {
    const f = frames[k];
    const soles = [f.pose.leftSoleY, f.pose.rightSoleY];
    for (const sole of soles)
      expect(sole, `${label}: sole below the court`).toBeGreaterThan(SOLE_FLOOR);
    if (f.gait.grounded) {
      expect(Math.min(...soles), `${label}: both feet off the court`).toBeLessThan(SOLE_CONTACT);
      soles.forEach((sole, i) => {
        if (sole > SOLE_CONTACT)
          expect(f.gait.feet[i].planted, `${label}: planted foot floating`).toBe(false);
      });
    }
    if (k === 0) continue;
    const a = frames[k - 1];
    const dt = f.t - a.t;
    const body = Math.hypot(f.x - a.x, f.z - a.z);
    travel += body;
    const fx = Math.sin(f.angle),
      fz = Math.cos(f.angle);
    const backward = ((f.x - a.x) * fx + (f.z - a.z) * fz) / Math.max(dt, 1e-3) < -0.25;
    (['LeftFoot', 'RightFoot'] as const).forEach((joint, i) => {
      const p = a.pose.joints[joint],
        q = f.pose.joints[joint];
      const step = Math.hypot(q.x - p.x, q.z - p.z);
      // a re-plant (teleport / long frame hitch) is a deliberate discontinuity, not a slide
      if (a.gait.feet[i].planted && f.gait.feet[i].planted && a.gait.resets === f.gait.resets) {
        slide += step;
        if (step > 0.01)
          worst.push({ slide: step, t: f.t, body, speed: f.gait.speed, moving: f.gait.moving });
      }
      if (backward && !f.gait.feet[i].planted) {
        const along = (q.x - p.x) * fx + (q.z - p.z) * fz;
        if (along / Math.max(dt, 1e-3) > 0.05) forwardSwingWhileBack++;
      }
    });
  }
  const replants = frames.at(-1)!.gait.resets - frames[0].gait.resets;
  report[label] = { frames: frames.length, travel, slide, forwardSwingWhileBack, replants };
  expect(replants, `${label}: feet re-planted ${replants} times`).toBeLessThanOrEqual(1);
  // stance feet are world anchored: slide is a small fraction of the distance travelled
  worst.sort((p, q) => q.slide - p.slide);
  expect(
    slide,
    `${label}: stance slide ${slide.toFixed(3)} m over ${travel.toFixed(2)} m ${JSON.stringify(worst.slice(0, 4))}`,
  ).toBeLessThan(0.02 + travel * 0.08);
  expect(forwardSwingWhileBack, `${label}: forward steps while backpedalling`).toBe(0);
}

test.setTimeout(150_000);
for (const cap of [0, 20])
  for (const legend of ['shaq', 'chuck'] as const) {
    test(`${legend}: posture and stepping follow measured motion — rest, start/stop, turn, Q, post backward, blocked push, defense, inbound ${cap ? '@20Hz' : '@default'}`, async ({
      page,
    }, info) => {
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      if (cap)
        await page.addInitScript((hz) => {
          const native = window.requestAnimationFrame.bind(window);
          window.requestAnimationFrame = (cb) => window.setTimeout(() => native(cb), 1000 / hz);
        }, cap);
      await bootGame(page);
      await page.bringToFront();
      const report: Record<string, unknown> = { legend, cap };
      await page.evaluate(async (legend) => {
        window.__TEST__!.setLegend!(0, legend);
        await window.__TEST__!.reset(42);
        window.__TEST__!.teleport('player', [3.5, 0.95, 0.5]);
        window.__TEST__!.teleport('opponent', [11, 0.95, -5]);
        window.__TEST__!.setHandling!(0, 'dribble', 1);
      }, legend);

      // ---- rest: settled, no stepping in place
      await settle(page, 0.8);
      const rest = await record(page, 0.8);
      checkFrames('rest', rest, report);
      for (const f of rest) {
        expect(f.gait.moving).toBe(false);
        expect(f.gait.feet.every((foot) => foot.planted && foot.lift === 0)).toBe(true);
      }

      // ---- start (heavy acceleration), forward, stop
      // run away from the rim so the post-up below has room to back in
      await move(page, 1, 0.2);
      const start = await record(page, 1.4);
      await move(page, 0, 0);
      const stop = await record(page, 1.2);
      checkFrames('start-forward', start, report);
      checkFrames('stop', stop, report);
      const top = config.player[legend].speed;
      // heavy start: the measured speed ramps up over ~0.4 s instead of jumping
      // (Rapier's linear damping keeps the measured cruise speed ~10% under the intent)
      const cruise = Math.max(...start.map((f) => f.gait.speed));
      const t10 = start.find((f) => f.gait.speed > cruise * 0.1)!.t,
        t90 = start.find((f) => f.gait.speed > cruise * 0.9)!.t;
      report.acceleration = { t10, t90, rampSeconds: t90 - t10 };
      expect(t90 - t10, 'instant acceleration').toBeGreaterThan(0.2);
      expect(start.some((f) => f.gait.speed > cruise * 0.2 && f.gait.speed < cruise * 0.8)).toBe(
        true,
      );
      expect(Math.max(...start.map((f) => f.gait.speed))).toBeGreaterThan(top * 0.85);
      expect(start.some((f) => f.gait.locomotion === 'forward')).toBe(true);
      expect(stop.at(-1)!.gait.moving).toBe(false);
      // the settle steps finish and the feet stay planted (no stepping in place)
      await expect
        .poll(() =>
          page.evaluate(() => window.__TEST__!.getLocomotion!(0)!.feet.every((f) => f.planted)),
        )
        .toBe(true);
      const settled = await record(page, 0.6);
      expect(settled.every((f) => f.gait.feet.every((foot) => foot.planted))).toBe(true);
      // the dribbling hand keeps ball contact while walking (Slice 2 ownership preserved)
      const hands = await page.evaluate(() => window.__TEST__!.getHandContacts!(0));
      expect(hands.some((h) => h.weight > 0.98 && h.error < 0.025)).toBe(true);

      // ---- Q: stationary enter (turn to face away from the rim + settle steps) and exit
      await tapQ(page);
      const qStill = await record(page, 1.2);
      checkFrames('q-enter-still', qStill, report);
      const postHipStill = qStill.at(-1)!.pose.hipsWorldY;
      expect(qStill.at(-1)!.mode).toBe('post');
      expect(qStill.at(-1)!.gait.posture).toBe('post');

      // ---- post-up: back toward the rim (backward relative to facing)
      await move(page, -1, 0);
      const back = await record(page, 1.4);
      await page.screenshot({ path: info.outputPath('post-backward.png') });
      await move(page, 0, 0);
      checkFrames('post-backward', back, report);
      expect(back.filter((f) => f.gait.locomotion === 'backward').length).toBeGreaterThan(
        back.length / 3,
      );
      const postHipMoving = back.slice(-4).reduce((s, f) => s + f.pose.hipsWorldY, 0) / 4;
      // the posture is one controlled height: moving in post does not sink further
      expect(Math.abs(postHipMoving - postHipStill), 'post sinks while moving').toBeLessThan(0.05);
      await tapQ(page);
      checkFrames('q-exit', await record(page, 0.9), report);

      // ---- blocked push: the opponent is pinned against the sideline, push straight into him
      await page.evaluate(() => {
        window.__TEST__!.teleport('opponent', [8, 0.95, -7.25]);
        window.__TEST__!.teleport('player', [8, 0.95, -5.9]);
      });
      await settle(page, 0.6);
      await move(page, 0, -1);
      // ~0.5 m of approach, then contact; give the net-motion filter time to see the stop
      await settle(page, 1.3);
      const blocked = await record(page, 1.0);
      await move(page, 0, 0);
      checkFrames('blocked-push', blocked, report);
      const blockedTravel = Math.hypot(
        blocked.at(-1)!.x - blocked[0].x,
        blocked.at(-1)!.z - blocked[0].z,
      );
      expect(blockedTravel, 'blocked player kept travelling').toBeLessThan(0.25);
      expect(Math.max(...blocked.map((f) => f.gait.brace)), 'no brace').toBeGreaterThan(0.5);
      // bracing shifts weight instead of walking in place (a real shove may cost one
      // balance step, but the gait is not running while the body is pinned)
      const walking = blocked.filter((f) => f.gait.moving).length;
      report.blockedWalkingFrames = `${walking}/${blocked.length}`;
      expect(walking, 'walking in place while blocked').toBeLessThanOrEqual(blocked.length * 0.2);
      await page.screenshot({ path: info.outputPath('blocked-brace.png') });

      // ---- on-ball defense: opponent holds the ball, slide sideways and backpedal
      await page.evaluate(() => {
        window.__TEST__!.teleport('opponent', [8, 0.95, 0]);
        window.__TEST__!.teleport('player', [6.8, 0.95, 0]);
        window.__TEST__!.teleport('ball', [8, 0.14, 0.75]); // beside him, never inside a capsule
      });
      await expect
        .poll(() =>
          page.evaluate(() => (window.__TEST__!.getState().ball as { owner: number }).owner),
        )
        .toBe(1);
      await settle(page, 0.8);
      const guard = await record(page, 0.4);
      // nobody is launched by the ball becoming solid next to them
      const heights = await page.evaluate(() => {
        const s = window.__TEST__!.getState();
        return [(s.player as { y: number }).y, (s.opponent as { y: number }).y];
      });
      for (const y of heights) expect(y).toBeLessThan(1);
      const guardInfo = await page.evaluate(() => {
        const s = window.__TEST__!.getState();
        const p = s.player as { x: number; z: number; mode: string },
          o = s.opponent as { x: number; z: number; mode: string };
        const ball = s.ball as { owner: number; state: string };
        return {
          p: [p.x, p.z, p.mode],
          o: [o.x, o.z, o.mode],
          owner: ball.owner,
          state: ball.state,
        };
      });
      expect(guard.at(-1)!.gait.posture, JSON.stringify(guardInfo)).toBe('defensive');
      expect(guard.at(-1)!.gait.upper).toBe('guard');
      await page.evaluate(() => window.__TEST__!.setDebugFlag('footContacts', true));
      // short moves so the defender stays inside the guard range of his man
      await move(page, 0, 1);
      const slide = await record(page, 0.7);
      await move(page, -1, 0);
      const backpedal = await record(page, 0.6);
      await move(page, 0, 0);
      await page.screenshot({ path: info.outputPath('defense-feet-debug.png') });
      await page.evaluate(() => window.__TEST__!.setDebugFlag('footContacts', false));
      checkFrames('defense-slide', slide, report);
      checkFrames('defense-backpedal', backpedal, report);
      // a defender facing his man steps sideways/backward, never walks forward away from him
      // (as he slides past, the angle to his man turns part of a slide into a backpedal)
      const share = (frames: Frame[], kinds: string[]) => {
        const moving = frames.filter((f) => f.gait.moving);
        expect(moving.length, `${kinds}: never stepped`).toBeGreaterThanOrEqual(2);
        return moving.filter((f) => kinds.includes(f.gait.locomotion)).length / moving.length;
      };
      report.defenseShares = {
        slideStrafe: share(slide, ['strafe']),
        backpedalBackward: share(backpedal, ['backward']),
      };
      expect(share(slide, ['strafe', 'backward'])).toBeGreaterThanOrEqual(0.8);
      expect(share(slide, ['strafe'])).toBeGreaterThanOrEqual(0.4);
      expect(share(backpedal, ['backward', 'strafe'])).toBeGreaterThanOrEqual(0.8);
      expect(share(backpedal, ['backward'])).toBeGreaterThanOrEqual(0.5);

      // ---- inbound: CPU denies the lane, the receiver turns to the ball and calls for it
      await page.evaluate(async () => {
        await window.__TEST__!.reset(42, 'inbound');
        window.__TEST__!.teleport('player', [5, 0.95, 3.5]);
        window.__TEST__!.teleport('opponent', [5.4, 0.95, 4.3]);
      });
      await settle(page, 0.8);
      const deny = await record(page, 0.4);
      expect(deny.at(-1)!.opponent?.upper).toBe('deny');
      expect(deny.at(-1)!.opponent?.posture).toBe('defensive');
      expect(deny.at(-1)!.gait.upper).toBe('relaxed');
      await page.screenshot({ path: info.outputPath('inbound-deny.png') });
      await expect
        .poll(() =>
          page.evaluate(
            () => (window.__TEST__!.getState().inbound as { stage: string } | null)?.stage,
          ),
        )
        .toBe('pass');
      await page.evaluate(() => window.__TEST__!.requestInboundPass!(0));
      // the explicit request raises the ball-side hand until the incoming ball is reached for
      await expect
        .poll(() => page.evaluate(() => window.__TEST__!.getLocomotion!(0)!.upper), {
          intervals: [20],
        })
        .toBe('callForPass');
      // one hand is actually up: a hand at least 20 cm above its shoulder joint
      await expect
        .poll(
          () =>
            page.evaluate(() => {
              const j = window.__TEST__!.getCharacterPose!(0)!.joints;
              return Math.max(j.LeftHand.y - j.LeftArm.y, j.RightHand.y - j.RightArm.y);
            }),
          { intervals: [20] },
        )
        .toBeGreaterThan(0.2);
      await page.screenshot({ path: info.outputPath('call-for-pass.png') });
      const receive = await record(page, 1.6);
      checkFrames('inbound-receive', receive, report);
      expect(receive.at(-1)!.gait.upper).toBe('hold');
      // regression: the caught ball (held inside the receiver's capsule) must not push the
      // receiver — it used to slide him across the court at ~12 m/s
      const caught = receive.findIndex((f) => f.gait.upper === 'hold');
      const afterCatch = receive.slice(caught);
      const drift = Math.hypot(
        afterCatch.at(-1)!.x - afterCatch[0].x,
        afterCatch.at(-1)!.z - afterCatch[0].z,
      );
      report.receiverDriftAfterCatch = drift;
      expect(drift, 'receiver pushed by the held ball').toBeLessThan(0.1);

      await writeFile(info.outputPath('locomotion-report.json'), JSON.stringify(report, null, 2));
      expect(errors).toEqual([]);
    });
  }
