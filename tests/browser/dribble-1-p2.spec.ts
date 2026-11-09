import { expect, test } from '@playwright/test';
import { createDefaultProfile } from '../../src/game/input/controlBindings';
import { bootGame } from './helpers';

declare global {
  interface Window {
    __p2Skill: { x: number; z: number };
  }
}

for (const legend of ['shaq', 'chuck'] as const) {
  test(`${legend}: P2 can take human control using only remapped right-stick axes`, async ({
    page,
  }) => {
    test.setTimeout(60_000);
    const profile = createDefaultProfile();
    for (const context of ['offense', 'defense'] as const) {
      profile[context].gamepad.SKILL_LEFT = { kind: 'axis', index: 4, sign: -1 };
      profile[context].gamepad.SKILL_RIGHT = { kind: 'axis', index: 4, sign: 1 };
      profile[context].gamepad.SKILL_UP = { kind: 'axis', index: 5, sign: -1 };
      profile[context].gamepad.SKILL_DOWN = { kind: 'axis', index: 5, sign: 1 };
    }
    await page.addInitScript((profile) => {
      localStorage.setItem('suits.controls.v1', JSON.stringify(profile));
      window.__p2Skill = { x: 0, z: 0 };
      Object.defineProperty(navigator, 'getGamepads', {
        configurable: true,
        value: () =>
          [0, 1].map((index) => ({
            id: `P${index + 1} test controller`,
            index,
            mapping: 'standard',
            connected: true,
            axes: [
              0,
              0,
              0,
              0,
              index === 1 ? window.__p2Skill.x : 0,
              index === 1 ? -window.__p2Skill.z : 0,
            ],
            timestamp: performance.now(),
            buttons: Array.from({ length: 16 }, () => ({
              pressed: false,
              touched: false,
              value: 0,
            })),
          })),
      });
    }, profile);
    await bootGame(page);
    await page.bringToFront();
    await page.locator('canvas').click({ position: { x: 10, y: 10 } });
    await page.evaluate(async (legend) => {
      window.__TEST__!.setLegend!(1, legend);
      await window.__TEST__!.reset(42, 'inbound-cpu');
      window.__TEST__!.teleport('opponent', [5, 0.95, 1.5]);
      window.__TEST__!.teleport('player', [2, 0.95, -2]);
    }, legend);
    const state = () => page.evaluate(() => window.__TEST__!.getState());
    await expect.poll(async () => (await state()).inbound).toMatchObject({ stage: 'pass' });
    await page.evaluate(() => window.__TEST__!.requestInboundPass!(1));
    await expect.poll(async () => (await state()).ball).toMatchObject({ owner: 1, state: 'held' });
    await page.evaluate(() => window.__TEST__!.setHandling!(1, 'hold', 1));
    await expect.poll(async () => (await state()).opponent).toMatchObject({ handling: 'hold' });
    // setHandling('hold') flushes inputs. Let the production gate observe neutral
    // after that reset before sending a deliberate new stick deflection.
    const resetTime = (await state()).time as number;
    await expect.poll(async () => (await state()).time as number).toBeGreaterThan(resetTime + 0.2);
    const before = await page.evaluate(() => {
      const player = window.__TEST__!.getState().opponent as {
        x: number;
        z: number;
        angle: number;
      };
      const center = window.__TEST__!.project!([player.x, 1.3, player.z]);
      const right = window.__TEST__!.project!([
        player.x - Math.cos(player.angle),
        1.3,
        player.z + Math.sin(player.angle),
      ]);
      const x = right.x - center.x;
      const z = center.y - right.y;
      const length = Math.hypot(x, z);
      window.__p2Skill = { x: x / length, z: z / length };
      return player;
    });
    await expect
      .poll(async () => (await state()).opponent)
      .toMatchObject({
        handling: 'dribble',
        hand: -1,
      });
    await expect.poll(async () => (await state()).ballControl).toMatchObject({ hand: -1 });
    await page.evaluate(() => (window.__p2Skill = { x: 0, z: 0 }));
    const after = (await state()).opponent as typeof before;
    expect(Math.hypot(after.x - before.x, after.z - before.z)).toBeLessThan(0.02);
    expect(after.angle).toBeCloseTo(before.angle, 5);
  });
}
