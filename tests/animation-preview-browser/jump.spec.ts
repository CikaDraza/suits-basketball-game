import { writeFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import type {} from '../../src/dev/defense-preview/DefenseScene';

test('clean Small Jump plays on the active Shaq rig independently before physics integration', async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('dev/jump-preview.html');
  await page.waitForFunction(() => window.__JUMP_PREVIEW__ != null);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  const report = await page.evaluate(() => window.__JUMP_PREVIEW__!.report);
  expect(report.bones).toBe(65);
  expect(report.maxWorldMatrixDelta).toBeLessThan(0.001);
  const samples = [];
  for (const [name, time] of [
    ['preparation', 0.05],
    ['takeoff', 0.25],
    ['reach', 0.45],
    ['landing', 0.7],
    ['recovery', 0.9],
  ] as const) {
    await page.evaluate((time) => window.__JUMP_PREVIEW__!.seek(time), time);
    const state = await page.evaluate(() => window.__JUMP_PREVIEW__!.getState());
    expect(state.duration).toBeLessThan(1);
    expect(state.visibleMeshes).not.toContain('AnimationSkeletonDeclaration');
    samples.push({ name, ...state });
    await page.screenshot({ path: info.outputPath(`${name}.png`) });
  }
  expect(samples[2].joints.RightHand[1]).toBeGreaterThan(samples[0].joints.RightHand[1] + 0.3);
  await writeFile(
    info.outputPath('jump-inspection.json'),
    JSON.stringify({ report, samples, errors }, null, 2),
  );
  expect(errors).toEqual([]);
});
