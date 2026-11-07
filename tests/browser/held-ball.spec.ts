import { expect, test, type Page } from '@playwright/test';
import { bootGame } from './helpers';
const snapshot = (page: Page) => page.evaluate(() => window.__TEST__!.getState());

for (const legend of ['shaq', 'chuck'] as const) {
  test(`${legend}: a stationary back-to-basket hold keeps both palms at the ball and elbows spread`, async ({
    page,
  }, info) => {
    await bootGame(page);
    await page.bringToFront();
    await page.locator('canvas').click({ position: { x: 10, y: 10 } });
    await page.evaluate(async (legend) => {
      window.__TEST__!.setLegend!(0, legend);
      await window.__TEST__!.reset(42);
      window.__TEST__!.teleport('player', [5, 0.95, 0]);
      window.__TEST__!.teleport('opponent', [2, 0.95, -2]);
    }, legend);
    await page.keyboard.down('q');
    try {
      await expect
        .poll(async () => ((await snapshot(page)).player as { mode: string }).mode)
        .toBe('post');
    } finally {
      await page.keyboard.up('q');
    }
    const from = (await snapshot(page)).time as number;
    await expect.poll(async () => (await snapshot(page)).time).toBeGreaterThan(from + 0.5);
    const result = await page.evaluate(() => ({
      state: window.__TEST__!.getState(),
      pose: window.__TEST__!.getCharacterPose!(0)!,
      grip: window.__TEST__!.getGrip!(0),
    }));
    const ball = result.state.ball as { x: number; y: number; z: number };
    const distance = (a: typeof ball, b: typeof ball) =>
      Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
    expect((result.state.player as { handling: string }).handling).toBe('hold');
    expect(result.state.dribbles).toBe(0);
    expect(distance(result.pose.joints.LeftHand, ball)).toBeLessThan(0.23);
    expect(distance(result.pose.joints.RightHand, ball)).toBeLessThan(0.23);
    expect(distance(result.grip.grip, ball)).toBeLessThan(0.03);
    const elbows = distance(result.pose.joints.LeftForeArm, result.pose.joints.RightForeArm);
    const shoulders = distance(result.pose.joints.LeftArm, result.pose.joints.RightArm);
    expect(elbows).toBeGreaterThan(shoulders * 1.1);
    await page.screenshot({ path: info.outputPath('two-hand-post.png') });
  });
}

test('a released tap jabs, a held direction dribbles without another jab, and blur cancels an unfinished gesture', async ({
  page,
}) => {
  await bootGame(page);
  await page.bringToFront();
  await page.locator('canvas').click({ position: { x: 10, y: 10 } });
  await page.evaluate(() => window.__TEST__!.reset(42));
  // Dispatch a complete real input path within one task: no physics frame can see the held level.
  await page.evaluate(() => {
    window.dispatchEvent(
      new KeyboardEvent('keydown', { code: 'ArrowUp', key: 'ArrowUp', bubbles: true }),
    );
    window.dispatchEvent(
      new KeyboardEvent('keyup', { code: 'ArrowUp', key: 'ArrowUp', bubbles: true }),
    );
  });
  await expect.poll(async () => (await snapshot(page)).jabs).toBe(1);
  expect((await snapshot(page)).dribbles).toBe(0);
  expect(((await snapshot(page)).player as { handling: string }).handling).toBe('hold');
  await page.keyboard.down('ArrowRight');
  try {
    await expect.poll(async () => (await snapshot(page)).dribbles).toBe(1);
    expect((await snapshot(page)).jabs).toBe(1);
  } finally {
    await page.keyboard.up('ArrowRight');
  }
  await page.evaluate(async () => {
    await window.__TEST__!.reset(42);
    window.__TEST__!.setInput({ moveX: 1 });
    window.dispatchEvent(new Event('blur'));
  });
  const from = (await snapshot(page)).time as number;
  await expect.poll(async () => (await snapshot(page)).time).toBeGreaterThan(from + 0.2);
  expect((await snapshot(page)).jabs).toBe(0);
  expect((await snapshot(page)).dribbles).toBe(0);
});
