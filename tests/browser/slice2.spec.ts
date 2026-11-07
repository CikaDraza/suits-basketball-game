import { writeFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { bootGame } from './helpers';
import type { CharacterPoseSnapshot } from '../../src/game/harness/characterPose';
type Point = { x: number; y: number; z: number };
type Frame = {
  ball: Point;
  hands: CharacterPoseSnapshot['hands'];
  phase: number;
  hand: number;
  crossing: boolean;
  time: number;
  local: Point;
};
const state = (page: Page) => page.evaluate(() => window.__TEST__!.getState());
async function settle(page: Page, seconds = 0.45) {
  const from = (await state(page)).time as number;
  await expect.poll(async () => (await state(page)).time).toBeGreaterThan(from + seconds);
}
async function frames(page: Page, seconds: number) {
  return page.evaluate(async (seconds) => {
    const result: Frame[] = [];
    const until = (window.__TEST__!.getState().time as number) + seconds;
    while ((window.__TEST__!.getState().time as number) < until || result.length < 8) {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const s = window.__TEST__!.getState();
      const ball = s.ball as { rendered: Point };
      const c = s.ballControl as { phase: number; hand: number; crossing: boolean; local: Point };
      result.push({
        ball: ball.rendered,
        hands: window.__TEST__!.getHandContacts!(0),
        phase: c.phase,
        hand: c.hand,
        crossing: c.crossing,
        time: s.time as number,
        local: c.local,
      });
    }
    return result;
  }, seconds);
}
test.setTimeout(90_000);
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
function checkHold(samples: Frame[]) {
  for (const frame of samples)
    for (const hand of frame.hands) {
      expect(hand.wristBend).toBeLessThan(65.02);
      expect(hand.error).toBeLessThan(0.025);
      expect(Math.abs(distance(hand.palm, frame.ball) - 0.13)).toBeLessThan(0.025);
      const towards = {
        x: frame.ball.x - hand.palm.x,
        y: frame.ball.y - hand.palm.y,
        z: frame.ball.z - hand.palm.z,
      };
      const dot =
        (towards.x * hand.normal.x + towards.y * hand.normal.y + towards.z * hand.normal.z) /
        Math.hypot(towards.x, towards.y, towards.z);
      expect(dot).toBeGreaterThan(0.94);
    }
}
/** |phase| from the bounce top inside which the active palm must be on the ball. */
const TOP_WINDOW = 0.07;
/**
 * Every rendered frame near the top of the bounce: the ACTIVE hand (ballControl.hand) has its
 * palm on the ball surface and facing it, and the other hand has let go. Returns the count.
 */
function checkTopContacts(samples: Frame[], label: string): number {
  let tops = 0;
  for (const f of samples) {
    if (!(f.phase < TOP_WINDOW || f.phase > 1 - TOP_WINDOW)) continue;
    tops++;
    const activeIndex = f.hand === 1 ? 0 : 1;
    const active = f.hands[activeIndex],
      idle = f.hands[1 - activeIndex];
    const where = `${label} t=${f.time.toFixed(2)} phase=${f.phase.toFixed(3)} hand=${f.hand}`;
    expect(Math.abs(distance(active.palm, f.ball) - 0.13), `${where}: palm off ball`).toBeLessThan(
      0.025,
    );
    const towards = {
      x: f.ball.x - active.palm.x,
      y: f.ball.y - active.palm.y,
      z: f.ball.z - active.palm.z,
    };
    const facing =
      (towards.x * active.normal.x + towards.y * active.normal.y + towards.z * active.normal.z) /
      Math.hypot(towards.x, towards.y, towards.z);
    expect(facing, `${where}: palm not facing ball`).toBeGreaterThan(0.9);
    expect(active.weight, `${where}: active arm not engaged`).toBeGreaterThan(0.9);
    expect(idle.weight, `${where}: other hand not released`).toBeLessThan(0.1);
  }
  return tops;
}
for (const cap of [0, 20])
  for (const [legend, mass] of [
    ['shaq', 150],
    ['chuck', 138],
  ] as const) {
    test(`${legend}: calibrated palms hold, turn, dribble both hands and cross continuously ${cap ? '@20Hz' : '@default'}`, async ({
      page,
    }, info) => {
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      if (cap)
        await page.addInitScript((hz) => {
          const nativeRAF = window.requestAnimationFrame.bind(window),
            nativeCancel = window.cancelAnimationFrame.bind(window);
          const pending = new Map<number, { timer: number; raf: number }>();
          let sequence = 0;
          window.requestAnimationFrame = (callback) => {
            const id = ++sequence,
              item = { timer: 0, raf: 0 };
            item.timer = window.setTimeout(() => {
              item.raf = nativeRAF((time) => {
                pending.delete(id);
                callback(time);
              });
            }, 1000 / hz);
            pending.set(id, item);
            return id;
          };
          window.cancelAnimationFrame = (id) => {
            const item = pending.get(id);
            if (item) {
              clearTimeout(item.timer);
              nativeCancel(item.raf);
              pending.delete(id);
            }
          };
        }, cap);
      await bootGame(page);
      await page.bringToFront();
      await page.locator('canvas').click({ position: { x: 10, y: 10 } });
      await page.evaluate(async (legend) => {
        window.__TEST__!.setLegend!(0, legend);
        await window.__TEST__!.reset(42);
        window.__TEST__!.teleport('player', [5, 0.95, 0]);
        window.__TEST__!.teleport('opponent', [9, 0.95, -4]);
        window.__TEST__!.inspectCharacter!('front');
      }, legend);
      await settle(page);
      expect(((await state(page)).ball as { bodyType: number }).bodyType).toBe(2);
      expect(((await state(page)).player as { mass: number }).mass).toBeCloseTo(mass, 3);
      checkHold(await frames(page, 0.5));
      await page.screenshot({ path: info.outputPath('hold-front.png') });
      await page.keyboard.down('q');
      try {
        await expect
          .poll(async () => ((await state(page)).player as { mode: string }).mode)
          .toBe('post');
      } finally {
        await page.keyboard.up('q');
      }
      await settle(page, 0.5);
      checkHold(await frames(page, 0.5));
      await page.evaluate(() => {
        window.__TEST__!.inspectCharacter!('side');
        window.__TEST__!.setDebugFlag('handContacts', true);
      });
      await page.screenshot({ path: info.outputPath('post-side-contacts.png') });
      await page.evaluate(() => {
        window.__TEST__!.setDebugFlag('handContacts', false);
        window.__TEST__!.setHandling!(0, 'dribble', 1);
      });
      await settle(page, 0.5);
      const left = await frames(page, 1.3);
      for (const f of left) {
        expect(f.ball.y).toBeGreaterThanOrEqual(0.128);
        expect(f.hands[0].wristBend).toBeLessThan(65.02);
        expect(f.hands[0].palm.y).toBeGreaterThan(0.95);
        if (f.phase < 0.04 || f.phase > 0.96)
          expect(Math.abs(f.hands[0].palm.y - (f.ball.y + 0.13))).toBeLessThan(0.04);
      }
      await page.screenshot({ path: info.outputPath('left-dribble.png') });
      let tops = checkTopContacts(left, 'left');
      await page.evaluate(() => window.__TEST__!.setHandling!(0, 'dribble', -1));
      const cross = await frames(page, 1.4);
      expect(cross.some((f) => f.crossing)).toBe(true);
      expect(cross.at(-1)!.hand).toBe(-1);
      for (let i = 1; i < cross.length; i++) {
        const dt = cross[i].time - cross[i - 1].time;
        expect(distance(cross[i].ball, cross[i - 1].ball)).toBeLessThan(10 * dt + 0.08);
        expect(cross[i].ball.y).toBeGreaterThanOrEqual(0.128);
      }
      tops += checkTopContacts(cross, 'cross');
      await settle(page, 0.3);
      const right = await frames(page, 1.2);
      for (const f of right) {
        expect(f.hands[1].wristBend).toBeLessThan(65.02);
        expect(f.hands[1].palm.y).toBeGreaterThan(0.95);
      }
      tops += checkTopContacts(right, 'right');
      await page.screenshot({ path: info.outputPath('right-dribble.png') });
      // dribble on the move with the right hand, then flip the stick: the real input path
      // (Duel → p.hand) requests a crossover, and the left hand must take over while walking
      await page.evaluate(() => window.__TEST__!.setInput({ moveX: -0.4, moveZ: 0.4 }));
      const moving = await frames(page, 1.4);
      await page.evaluate(() => window.__TEST__!.setInput({ moveX: 0.4, moveZ: 0.4 }));
      const movingCross = await frames(page, 1.6);
      await page.evaluate(() => window.__TEST__!.setInput({ moveX: 0, moveZ: 0 }));
      for (const f of [...moving, ...movingCross]) {
        const active = f.hands[f.hand === 1 ? 0 : 1];
        expect(active.wristBend).toBeLessThan(65.02);
        expect(f.ball.y).toBeGreaterThanOrEqual(0.128);
        // A crossover hands over at floor contact (phase 0.5); the receiving arm blends in
        // while the ball rebounds and must be fully engaged well before the next top.
        if (active.weight >= 0.98) expect(active.error).toBeLessThan(0.025);
        else {
          expect(f.phase, 'takeover blend only while the ball is low').toBeGreaterThanOrEqual(0.5);
          expect(f.phase, 'takeover blend only while the ball is low').toBeLessThan(0.9);
        }
      }
      const travelled = distance(moving[0].ball, movingCross.at(-1)!.ball);
      expect(travelled, 'player actually moved while dribbling').toBeGreaterThan(1);
      expect(movingCross.some((f) => f.crossing)).toBe(true);
      expect(movingCross.at(-1)!.hand).toBe(1);
      tops += checkTopContacts(moving, 'moving-right');
      tops += checkTopContacts(movingCross, 'moving-cross');
      // even at 20 Hz the windows must have been sampled several times
      expect(tops, 'bounce tops sampled').toBeGreaterThanOrEqual(4);
      await page.evaluate(() => window.__TEST__!.setHandling!(0, 'hold', -1));
      await settle(page, 0.6);
      checkHold(await frames(page, 0.4));
      await page.screenshot({ path: info.outputPath('hold-after-transitions.png') });
      await info.attach('contact-samples', {
        body: JSON.stringify({ left, cross, right, moving, movingCross }),
        contentType: 'application/json',
      });
      const report = {
        legend,
        cap,
        mass,
        frames: left.length + cross.length + right.length + moving.length + movingCross.length,
        bounceTopsChecked: tops,
        observedDribbleFps: (left.length - 1) / (left.at(-1)!.time - left[0].time),
        maxWrist: Math.max(
          ...[...left, ...right, ...moving, ...movingCross].flatMap((f) =>
            f.hands.map((h) => h.wristBend),
          ),
        ),
        maxActiveContactError: Math.max(
          ...[...moving, ...movingCross]
            .map((f) => f.hands[f.hand === 1 ? 0 : 1])
            .filter((h) => h.weight >= 0.98)
            .map((h) => h.error),
        ),
        minBallY: Math.min(...[...left, ...cross, ...right].map((f) => f.ball.y)),
        physicsFloor: (await state(page)).ballControl,
      };
      expect((report.physicsFloor as { lastFloorY: number }).lastFloorY).toBeCloseTo(0.13, 3);
      await writeFile(info.outputPath('contact-report.json'), JSON.stringify(report, null, 2));
      await writeFile(
        info.outputPath('contact-samples.json'),
        JSON.stringify({ left, cross, right, moving, movingCross }),
      );
      expect(errors).toEqual([]);
    });
  }
