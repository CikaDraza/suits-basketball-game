import { expect, test } from '@playwright/test';
import { bootGame } from './helpers';
import config from '../../src/game/data/game-config.json' with { type: 'json' };

test('loads the scene, moves directly into a dribble, and charges/releases a shot', async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await bootGame(page);
  await page.screenshot({ path: info.outputPath('desktop.png') });
  await page.evaluate(() => window.__TEST__!.reset(42));

  const start = await page.evaluate(
    () => window.__TEST__!.getState().player as { x: number; z: number },
  );
  await page.keyboard.down('ArrowRight');
  try {
    await expect
      .poll(() => page.evaluate(() => window.__TEST__!.getState().dribbles))
      .toBeGreaterThan(0);
    await expect
      .poll(async () => {
        const position = await page.evaluate(
          () => window.__TEST__!.getState().player as { x: number; z: number },
        );
        return Math.hypot(position.x - start.x, position.z - start.z);
      })
      .toBeGreaterThan(0.15);
    expect(await page.evaluate(() => window.__TEST__!.getState().jabs)).toBe(0);
  } finally {
    await page.keyboard.up('ArrowRight');
  }

  await page.keyboard.down('r');
  try {
    await expect
      .poll(() =>
        page.evaluate(() => (window.__TEST__!.getState().player as { charge: number }).charge),
      )
      .toBeGreaterThan(config.shots.minHold);
  } finally {
    await page.keyboard.up('r');
  }
  await expect
    .poll(() => page.evaluate(() => window.__TEST__!.getState().shots))
    .toBeGreaterThan(0);
  await page.screenshot({ path: info.outputPath('shot.png') });
  expect(errors).toEqual([]);
});

test('reuses model requests across matchup changes and resets inbound state', async ({
  page,
}, info) => {
  const modelRequests: string[] = [];
  page.on('request', (request) => {
    if (request.url().endsWith('.glb')) modelRequests.push(request.url());
  });
  await bootGame(page);

  for (const legends of [
    ['chuck', 'shaq'],
    ['shaq', 'chuck'],
  ] as const) {
    await page.evaluate(([first, second]) => {
      window.__TEST__!.setLegend!(0, first);
      window.__TEST__!.setLegend!(1, second);
    }, legends);
    await expect
      .poll(() => page.evaluate(() => window.__TEST__!.getState().legends))
      .toEqual(legends);
    await expect
      .poll(() => page.evaluate(() => window.__TEST__!.getPerformance().drawCalls))
      .toBeGreaterThan(0);
  }
  expect(modelRequests).toHaveLength(2);
  expect(new Set(modelRequests).size).toBe(2);

  await page.evaluate(() => window.__TEST__!.reset(42, 'inbound'));
  await expect
    .poll(() => page.evaluate(() => window.__TEST__!.getState().phase))
    .toBe('INBOUND_PHASE');
  await expect(page.locator('.inbound-countdown')).toBeVisible();
  await page.evaluate(() => window.__TEST__!.reset(42));
  await expect.poll(() => page.evaluate(() => window.__TEST__!.getState().phase)).toBe('LIVE');
  const reset = await page.evaluate(() => window.__TEST__!.getState());
  expect(reset.score).toBe(0);
  expect(reset.cpuScore).toBe(0);
  expect(reset.inbound).toBeNull();
  expect(reset.charge).toBe(0);
  await page.screenshot({ path: info.outputPath('reset.png') });
});

test('supports screenshot freeze and phone layouts without scene errors', async ({
  page,
}, info) => {
  await bootGame(page);
  await page.evaluate(() => {
    window.__PAUSED__ = true;
  });
  await page.waitForTimeout(200);
  const frozen = await page.evaluate(() => window.__TEST__!.getState().time);
  await page.waitForTimeout(150);
  expect(await page.evaluate(() => window.__TEST__!.getState().time)).toBe(frozen);
  await page.evaluate(() => {
    window.__PAUSED__ = false;
  });
  await expect
    .poll(() => page.evaluate(() => window.__TEST__!.getState().time))
    .toBeGreaterThan(frozen as number);

  await page.setViewportSize({ width: 844, height: 390 });
  await page.screenshot({ path: info.outputPath('phone-landscape.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('.rotate-device')).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.__TEST__!.getState().screen)).toBe('paused');
  await page.keyboard.press('Escape');
  await expect.poll(() => page.evaluate(() => window.__TEST__!.getState().screen)).toBe('paused');
  await page.screenshot({ path: info.outputPath('phone-portrait.png') });
});
