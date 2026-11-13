import { writeFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import type { DefensePreviewApi } from '../../src/dev/defense-preview/DefenseScene';

test('full defense sequence plays on a single active Shaq with pause, seek, restart and mobile preview', async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error' || message.text().includes('THREE.PropertyBinding'))
      errors.push(message.text());
  });
  page.on('requestfailed', (request) => errors.push(request.url()));
  page.on('response', (response) => {
    if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`);
  });
  await page.goto('dev/defense-preview.html');
  await page.waitForFunction(() => Boolean(window.__DEFENSE_PREVIEW__));
  await expect(page.getByRole('heading', { name: 'Rig compatibility verified' })).toBeVisible();
  const state = () => page.evaluate(() => window.__DEFENSE_PREVIEW__!.getState());
  expect((await state()).clip).toBe('SHAQ_DEFENSE_SEQUENCE_V01');
  expect((await state()).visibleMeshes).toHaveLength(8);
  expect(await page.evaluate(() => '__TEST__' in window)).toBe(false);
  await page.getByRole('button', { name: 'Restart', exact: true }).click();
  await expect.poll(async () => (await state()).playing).toBe(true);
  const start = (await state()).time;
  await expect.poll(async () => (await state()).time).toBeGreaterThan(start + 0.2);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await expect.poll(async () => (await state()).playing).toBe(false);
  const paused = (await state()).time;
  await page.waitForTimeout(200);
  expect((await state()).time).toBeCloseTo(paused, 6);
  const frames: ReturnType<DefensePreviewApi['getState']>[] = [];
  for (const time of [0, 1, 2.5, 4, 5.3]) {
    await page.evaluate((time) => window.__DEFENSE_PREVIEW__!.seek(time), time);
    const frame = await state();
    frames.push(frame);
    expect(frame.time).toBeCloseTo(time, 5);
    expect(Object.values(frame.joints).flat().every(Number.isFinite)).toBe(true);
    await expect(page.getByLabel('Playback time')).toContainText(`${time.toFixed(2)} /`);
    await page.screenshot({ path: info.outputPath(`defense-${time.toFixed(1)}.png`) });
  }
  expect(
    frames.some((frame) => Math.abs(frame.joints.LeftHand[1] - frames[0].joints.LeftHand[1]) > 0.1),
  ).toBe(true);
  await page.getByRole('slider', { name: /Animation speed/ }).focus();
  await page.keyboard.press('End');
  await page.getByRole('button', { name: 'Restart', exact: true }).click();
  await expect.poll(async () => (await state()).time).toBeLessThan(1);
  await expect.poll(async () => (await state()).time).toBeCloseTo(16 / 3, 4);
  expect((await state()).playing).toBe(false);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: info.outputPath('defense-mobile.png'), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await writeFile(
    info.outputPath('defense-inspection.json'),
    JSON.stringify(
      { report: await page.evaluate(() => window.__DEFENSE_PREVIEW__!.report), frames, errors },
      null,
      2,
    ),
  );
  expect(errors).toEqual([]);
});
