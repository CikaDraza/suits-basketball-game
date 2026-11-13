import { writeFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { bootGame } from './helpers';
import type { CharacterPoseSnapshot } from '../../src/game/harness/characterPose';
import type { LocomotionSnapshot } from '../../src/game/entities/locomotionDebug';

test.use({ viewport: { width: 960, height: 540 } });

test('production Free Movement: keyboard walk → Q defense sequence → pause/resume → held pose → walk', async ({
  page,
}, info) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('response', (response) => {
    if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`);
  });
  await page.goto('./');
  await page.waitForFunction(
    () => window.__TEST__?.ready && window.__TEST__.getEntities().length === 5,
  );
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await page.getByRole('button', { name: 'TRAINING', exact: true }).click();
  await page.getByRole('button', { name: /FREE MOVEMENT/ }).click();
  await page.getByRole('button', { name: /START TRAINING/ }).click();
  const locomotion = () => page.evaluate(() => window.__TEST__!.getLocomotion!(0)!);
  await expect.poll(async () => (await locomotion())?.importedDefense?.phase).toBe('inactive');
  await page.screenshot({ path: info.outputPath('00-before-input.png') });
  await page.keyboard.down('d');
  try {
    await expect.poll(async () => (await locomotion()).importedWalk?.weight).toBeGreaterThan(0.95);
    await page.keyboard.press('q');
    await expect.poll(async () => (await locomotion()).importedDefense?.weight).toBe(1);
    await expect.poll(async () => (await locomotion()).importedDefense?.appliedLower).toBe(0);
    await page.screenshot({ path: info.outputPath('01-moving-defense.png') });
  } finally {
    await page.keyboard.up('d');
  }
  await expect
    .poll(async () => (await locomotion()).importedDefense?.lowerWeight)
    .toBeGreaterThan(0.98);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  const paused = (await locomotion()).importedDefense!.time;
  await page.waitForTimeout(250);
  expect((await locomotion()).importedDefense!.time).toBe(paused);
  await page.getByRole('button', { name: /BACK TO BUSINESS/ }).click();
  await expect.poll(async () => (await locomotion()).importedDefense?.time).toBeGreaterThan(paused);
  const samples = await page.evaluate(async () => {
    const result: { pose: CharacterPoseSnapshot; locomotion: LocomotionSnapshot }[] = [];
    for (let n = 0; n < 12; n++) {
      await new Promise<void>((resolve) => setTimeout(resolve, 100));
      result.push({
        pose: window.__TEST__!.getCharacterPose!(0)!,
        locomotion: window.__TEST__!.getLocomotion!(0)!,
      });
    }
    return result;
  });
  await page.screenshot({ path: info.outputPath('02-stationary-defense.png') });
  await expect
    .poll(async () => (await locomotion()).importedDefense?.phase, { timeout: 15000 })
    .toBe('hold');
  const held = await page.evaluate(() => window.__TEST__!.getCharacterPose!(0)!);
  expect(held.joints.LeftHand.y).toBeGreaterThan(held.joints.Head.y);
  expect(held.joints.RightHand.y).toBeGreaterThan(held.joints.Head.y);
  await page.screenshot({ path: info.outputPath('03-held-high.png') });
  for (const { pose } of samples) {
    expect(Math.min(pose.leftSoleY, pose.rightSoleY)).toBeGreaterThan(-0.01);
    expect(Math.min(pose.leftSoleY, pose.rightSoleY)).toBeLessThan(0.025);
    expect(pose.bodyY).toBeCloseTo(held.bodyY, 2);
    expect(pose.capsuleHalfHeight).toBe(held.capsuleHalfHeight);
    expect(pose.capsuleRadius).toBe(held.capsuleRadius);
  }
  await page.keyboard.down('d');
  try {
    await page.keyboard.press('q');
    await expect.poll(async () => (await locomotion()).importedDefense?.phase).toBe('inactive');
    await expect.poll(async () => (await locomotion()).importedWalk?.weight).toBeGreaterThan(0.95);
    await page.screenshot({ path: info.outputPath('04-return-to-walk.png') });
  } finally {
    await page.keyboard.up('d');
  }
  expect((await page.evaluate(() => window.__TEST__!.getState())).renderedCharacters).toEqual([0]);
  await writeFile(
    info.outputPath('sequence.json'),
    JSON.stringify({ samples, held, errors }, null, 2),
  );
  expect(errors).toEqual([]);
});

test('defense yields to explicit hands, possession/post-up and reset; Chuck keeps his existing pose', async ({
  page,
}, info) => {
  await bootGame(page);
  await page.evaluate(() => {
    window.__TEST__!.teleport('player', [6, 0.95, 0]);
    window.__TEST__!.teleport('opponent', [11, 0.95, -5]);
    window.__TEST__!.teleport('ball', [1, 0.13, -6]);
  });
  await page.keyboard.press('q');
  const defense = () => page.evaluate(() => window.__TEST__!.getLocomotion!(0)?.importedDefense);
  await expect.poll(async () => (await defense())?.weight).toBe(1);
  await page.evaluate(() => window.__TEST__!.setDefensivePose!(0, 'left'));
  await expect
    .poll(() => page.evaluate(() => window.__TEST__!.getCharacterPose!(0)!.defensiveArms[0].weight))
    .toBeGreaterThan(0.95);
  expect((await defense())?.phase).not.toBe('inactive');
  await page.evaluate(() => window.__TEST__!.setDefensivePose!(0, null));
  await expect
    .poll(() => page.evaluate(() => window.__TEST__!.getCharacterPose!(0)!.defensiveArms[0].weight))
    .toBe(0);
  await page.evaluate(() => {
    const p = window.__TEST__!.getState().player as { x: number; z: number };
    window.__TEST__!.teleport('ball', [p.x + 0.65, 1.3, p.z]);
    // Loose-ball pickup requires a movement/action intent; an idle player does
    // not automatically collect a ball merely teleported into reach.
    window.__TEST__!.setInput({ moveX: 0.2, moveZ: 0 });
  });
  try {
    await expect.poll(() => page.evaluate(() => window.__TEST__!.getState().owner)).toBe(0);
  } finally {
    await page.evaluate(() => {
      window.__TEST__!.setInput({ moveX: 0, moveZ: 0 });
      window.__TEST__!.setHandling!(0, 'hold', 1);
    });
  }
  await expect.poll(async () => (await defense())?.phase).toBe('inactive');
  await expect
    .poll(() => page.evaluate(() => window.__TEST__!.getCharacterPose!(0)!.hands[0].error))
    .toBeLessThan(0.025);
  await page.screenshot({ path: info.outputPath('possession-ik.png') });
  await page.evaluate(() => window.__TEST__!.reset(42, 'live'));
  await expect.poll(async () => (await defense())?.weight).toBe(0);
  await page.evaluate(async () => {
    window.__TEST__!.setLegend!(0, 'chuck');
    await window.__TEST__!.reset(42, 'live');
  });
  await page.keyboard.press('q');
  await expect
    .poll(() => page.evaluate(() => (window.__TEST__!.getState().player as { mode: string }).mode))
    .toBe('post');
  expect(await defense()).toBeUndefined();
});
