import { writeFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import type { AnimationPreviewApi } from '../../src/dev/animation-preview/PreviewScene';

async function openPreview(page: Page) {
  await page.goto('dev/animation-preview.html');
  await page.waitForFunction(() => Boolean(window.__ANIMATION_PREVIEW__));
  await expect(page.getByRole('heading', { name: 'Animated GLB inspection' })).toBeVisible();
}
const playback = (page: Page) => page.evaluate(() => window.__ANIMATION_PREVIEW__!.getState());

test('isolated preview plays full clips, pauses, restarts, changes speed and explicitly reveals auxiliary FBX geometry', async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('requestfailed', (request) => errors.push(request.url()));
  await openPreview(page);
  expect(await page.evaluate(() => '__TEST__' in window)).toBe(false);
  expect((await playback(page)).clip).toContain('Retarget');
  expect((await playback(page)).visibleMeshes).toHaveLength(8);
  expect((await playback(page)).visibleMeshes).not.toContain('Beta_Joints');
  await expect(
    page.getByText('Export contains 2 auxiliary meshes:', { exact: false }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await expect.poll(async () => (await playback(page)).playing).toBe(false);
  const paused = (await playback(page)).time;
  await page.waitForTimeout(300);
  expect((await playback(page)).time).toBeCloseTo(paused, 6);
  await page.getByRole('button', { name: 'Restart', exact: true }).click();
  await expect.poll(async () => (await playback(page)).time).toBe(0);
  await page.getByRole('slider', { name: /Animation speed/ }).focus();
  await page.keyboard.press('End');
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect.poll(async () => (await playback(page)).speed).toBe(2);
  await expect.poll(async () => (await playback(page)).loops).toBeGreaterThanOrEqual(2);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await page.screenshot({ path: info.outputPath('clean-preview.png') });
  await page.getByRole('checkbox', { name: 'Show Shaq skeleton' }).check();
  await expect.poll(async () => (await playback(page)).overlay?.populated).toBe(true);
  expect((await playback(page)).overlay!.rootError).toBeLessThan(1e-6);
  await page.screenshot({ path: info.outputPath('skeleton-overlay.png') });
  await page.getByRole('checkbox', { name: 'Show Shaq skeleton' }).uncheck();
  await page.getByRole('checkbox', { name: 'Show auxiliary FBX objects (raw export)' }).check();
  await expect.poll(async () => (await playback(page)).visibleMeshes).toHaveLength(10);
  await page.screenshot({ path: info.outputPath('raw-export-fbx-leftovers.png') });
  await page.getByRole('checkbox', { name: 'Show auxiliary FBX objects (raw export)' }).uncheck();
  await page
    .getByRole('combobox', { name: 'Animation', exact: true })
    .selectOption('Armature.001|mixamo.com|Layer0');
  await expect(
    page.getByText('Selected clip targets the auxiliary FBX rig, not Shaq.'),
  ).toBeVisible();
  await page.getByRole('combobox', { name: 'Animation', exact: true }).selectOption('FaceDemo');
  await expect.poll(async () => (await playback(page)).duration).toBeCloseTo(3.2, 5);
  expect(errors).toEqual([]);
});

test('real textured GLBs retain the primary rig and show both hands and feet through the entire exported walking cycle', async ({
  page,
}, info) => {
  await openPreview(page);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await expect.poll(async () => (await playback(page)).playing).toBe(false);
  const report = await page.evaluate(() => window.__ANIMATION_PREVIEW__!.report);
  expect(report.comparison.missing).toEqual([]);
  expect(report.comparison.reparented).toEqual([]);
  expect(report.animated.bones).toHaveLength(65);
  expect(report.animated.clips).toHaveLength(3);
  expect(report.animated.clips.flatMap((clip) => clip.unresolved)).toEqual([]);
  const originalMaps = report.original.meshes.flatMap((mesh) =>
    mesh.materials.map((m) => m.colorMap),
  );
  const importedMaps = report.animated.meshes
    .filter((mesh) => mesh.character)
    .flatMap((mesh) => mesh.materials.map((m) => m.colorMap));
  expect(importedMaps).toEqual(originalMaps);
  const frames: ReturnType<AnimationPreviewApi['getState']>[] = [];
  for (const time of [0, 1 / 30, 0.266667, 0.533333, 0.8, 1.066666]) {
    await page.evaluate((time) => window.__ANIMATION_PREVIEW__!.seek(time), time);
    frames.push(await playback(page));
    await page.screenshot({ path: info.outputPath(`walk-${time.toFixed(3)}.png`) });
  }
  for (const name of ['LeftHand', 'RightHand', 'LeftFoot', 'RightFoot']) {
    const relative = frames.map((frame) =>
      frame.joints[name].map((v, axis) => v - frame.joints.Hips[axis]),
    );
    const range = [0, 1, 2].map(
      (axis) =>
        Math.max(...relative.map((p) => p[axis])) - Math.min(...relative.map((p) => p[axis])),
    );
    expect(Math.hypot(...range), name).toBeGreaterThan(0.05);
    expect(relative.flat().every(Number.isFinite)).toBe(true);
  }
  await writeFile(info.outputPath('inspection.json'), JSON.stringify({ report, frames }, null, 2));
});
