import { writeFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { bootGame } from './helpers';
import type { Fighter } from '../../src/game/simulation/types';
import { config } from '../../src/game/data/gameConfig';

test.use({ viewport: { width: 800, height: 450 }, hasTouch: true });
declare global {
  interface Window {
    __jumpButtons: number[][];
  }
}
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.__jumpButtons = [[], []];
    Object.defineProperty(navigator, 'getGamepads', {
      configurable: true,
      value: () =>
        window.__jumpButtons.map((pressed, index) => ({
          id: `Jump pad ${index}`,
          index,
          connected: true,
          mapping: 'standard',
          timestamp: performance.now(),
          axes: [0, 0, 0, 0],
          buttons: Array.from({ length: 16 }, (_, i) => ({
            pressed: pressed.includes(i),
            value: Number(pressed.includes(i)),
            touched: pressed.includes(i),
          })),
        })),
    });
  });
});

for (const legend of ['shaq', 'chuck'] as const) {
  test(`${legend}: a physical hop preserves ball ownership and the final two-hand grip`, async ({
    page,
  }, info) => {
    await bootGame(page);
    await page.evaluate(async (legend) => {
      window.__TEST__!.setLegend!(0, legend);
      await window.__TEST__!.reset(42, 'live');
      window.__TEST__!.teleport('opponent', [12, 0.95, -5]);
    }, legend);
    await page.waitForFunction(() => {
      const seam = window.__TEST__!;
      return (
        (seam.getState().player as Fighter).jump.grounded &&
        seam.getCharacterPose!(0)?.hands.every((h) => h.weight > 0.95 && h.error < 0.04)
      );
    });
    await page.keyboard.press('f');
    const samples = await page.evaluate(async () => {
      const seam = window.__TEST__!,
        rows = [];
      for (let i = 0; i < 60; i++) {
        const state = seam.getState(),
          jump = (state.player as Fighter).jump;
        rows.push({ owner: state.owner, jump: { ...jump }, pose: seam.getCharacterPose!(0)! });
        if (jump.takeoffs === 1 && jump.phase === 'grounded') break;
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      }
      return rows;
    });
    await writeFile(info.outputPath('held-jump.json'), JSON.stringify(samples, null, 2));
    expect(samples.some((s) => s.jump.height > 0.1)).toBe(true);
    expect(samples.every((s) => s.owner === 0 && s.jump.takeoffs <= 1)).toBe(true);
    for (const sample of samples.filter((s) => s.jump.phase === 'airborne')) {
      expect(sample.pose.hands.every((h) => h.weight > 0.95)).toBe(true);
      expect(Math.max(...sample.pose.hands.map((h) => h.error))).toBeLessThan(0.04);
    }
    expect(samples.at(-1)!.jump.phase).toBe('grounded');
  });

  test(`${legend}: keyboard, Triangle-Y and touch jump use one physics takeoff and land with foot support`, async ({
    page,
  }, info) => {
    test.setTimeout(75_000);
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await bootGame(page);
    await page.evaluate((legend) => window.__TEST__!.setLegend!(0, legend), legend);
    await page.getByRole('button', { name: 'Pause', exact: true }).click();
    await page.getByRole('button', { name: 'TRAINING', exact: true }).click();
    await page.getByRole('button', { name: /FREE MOVEMENT/ }).click();
    await page.getByRole('button', { name: /START TRAINING/ }).click();
    const jump = () => page.evaluate(() => (window.__TEST__!.getState().player as Fighter).jump);
    await expect.poll(async () => (await jump()).grounded).toBe(true);
    await page.evaluate(() => window.__TEST__!.diagnostics!.start());
    await page.keyboard.down('f');
    await page.waitForFunction(
      () => (window.__TEST__!.getState().player as Fighter).jump.height > 0.1,
    );
    await page.evaluate(() => {
      window.__PAUSED__ = true;
    });
    const airborne = await page.evaluate(() => ({
      player: window.__TEST__!.getState().player,
      pose: window.__TEST__!.getCharacterPose!(0)!,
      gait: window.__TEST__!.getLocomotion!(0)!,
    }));
    expect(airborne.pose.bodyY).toBeGreaterThan(1.02);
    expect(airborne.gait.grounded).toBe(false);
    if (legend === 'shaq') expect(airborne.gait.importedJump!.applied).toBeGreaterThan(15);
    await page.screenshot({ path: info.outputPath('physical-airborne.png') });
    await page.evaluate(() => {
      window.__PAUSED__ = false;
    });
    await page.keyboard.up('f');
    await page.keyboard.press('f');
    await expect.poll(async () => (await jump()).phase).toBe('grounded');
    expect((await jump()).takeoffs).toBe(1);
    expect((await jump()).airborneObserved).toBe(true);
    const landed = await page.evaluate(() => window.__TEST__!.getCharacterPose!(0)!);
    expect(Math.min(landed.leftSoleY, landed.rightSoleY)).toBeGreaterThan(-0.012);
    expect(Math.min(landed.leftSoleY, landed.rightSoleY)).toBeLessThan(0.03);
    await page.screenshot({ path: info.outputPath('landed.png') });
    await page.evaluate(() => {
      window.__jumpButtons[0] = [3];
    });
    await expect.poll(async () => (await jump()).takeoffs).toBe(2);
    await expect.poll(async () => (await jump()).phase).toBe('grounded');
    await page.waitForTimeout(400);
    expect((await jump()).takeoffs).toBe(2);
    expect((await page.evaluate(() => window.__TEST__!.getState().player as Fighter)).mode).toBe(
      'idle',
    );
    await page.evaluate(() => {
      window.__jumpButtons[0] = [];
    });
    await page.getByRole('button', { name: /^Jump:/ }).tap();
    await expect.poll(async () => (await jump()).takeoffs).toBe(3);
    await expect.poll(async () => (await jump()).phase).toBe('grounded');
    await page.keyboard.down('d');
    try {
      await expect
        .poll(() => page.evaluate(() => window.__TEST__!.getLocomotion!(0)!.moving))
        .toBe(true);
      if (legend === 'shaq')
        await expect
          .poll(() => page.evaluate(() => window.__TEST__!.getLocomotion!(0)!.importedWalk!.weight))
          .toBeGreaterThan(0.95);
    } finally {
      await page.keyboard.up('d');
    }
    await writeFile(
      info.outputPath('jump-evidence.json'),
      JSON.stringify(
        {
          airborne,
          landed,
          final: await jump(),
          recording: await page.evaluate(() => window.__TEST__!.diagnostics!.export()),
          errors,
        },
        null,
        2,
      ),
    );
    expect(errors).toEqual([]);
  });

  test(`${legend}: defender reaches toward an actual shooting opponent's ball and reports preview contact separately`, async ({
    page,
  }, info) => {
    await bootGame(page);
    await page.evaluate(async (legend) => {
      window.__TEST__!.setLegend!(1, legend);
      await window.__TEST__!.reset(42, 'live');
    }, legend);
    await page.waitForFunction(() => window.__TEST__!.getCharacterPose!(1) != null);
    await page.evaluate(() => {
      window.__TEST__!.teleport('player', [5, 0.95, 0]);
      window.__TEST__!.teleport('opponent', [5.85, 0.95, 0]);
    });
    await page.waitForFunction(
      () =>
        (window.__TEST__!.getState().opponent as Fighter).jump.grounded &&
        window.__TEST__!.getRightStickDebug!(1)?.enabled,
    );
    await page.keyboard.down('r');
    await expect
      .poll(() => page.evaluate(() => (window.__TEST__!.getState().player as Fighter).charge))
      .toBeGreaterThan(config.shots.minHold + 0.05);
    await page.keyboard.up('r');
    await page.waitForFunction(() => window.__TEST__!.getState().shots === 1);
    const samples = await page.evaluate(async () => {
      window.__jumpButtons[1] = [3];
      const result = [],
        seam = window.__TEST__!;
      for (let n = 0; n < 25; n++) {
        result.push({
          jump: { ...(seam.getState().opponent as Fighter).jump },
          pose: seam.getCharacterPose!(1),
          gait: seam.getLocomotion!(1),
        });
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      }
      return result;
    });
    await writeFile(
      info.outputPath('block-preview-evidence.json'),
      JSON.stringify(samples, null, 2),
    );
    expect(samples.some((s) => s.jump.takeoffs === 1)).toBe(true);
    expect(samples.some((s) => s.jump.handToBallDistance !== null)).toBe(true);
    expect(samples.every((s) => s.jump.blockApplied === false)).toBe(true);
  });
}
