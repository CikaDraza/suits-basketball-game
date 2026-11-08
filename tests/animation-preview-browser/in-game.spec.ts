import { writeFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { config } from '../../src/game/data/gameConfig';
import { createMovementTransform } from '../../src/game/simulation/coordinates';
import type { CharacterPoseSnapshot } from '../../src/game/harness/characterPose';
import type { LocomotionSnapshot } from '../../src/game/entities/locomotionDebug';
import '../browser/helpers';

test('approved Shaq walking export runs inside the game, stays grounded and leaves dribble hands and Q posture under existing control', async ({
  page,
}, info) => {
  test.setTimeout(90_000);
  const errors: string[] = [],
    models: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => {
    if (request.url().endsWith('.glb')) models.push(request.url());
  });
  await page.goto('./');
  await page.waitForFunction(
    () => window.__TEST__?.ready && window.__TEST__.getEntities().length >= 3,
  );
  await page.evaluate(async () => {
    window.__TEST__!.setDebugFlag('testMode', true);
    await window.__TEST__!.reset(42, 'live');
    window.__TEST__!.teleport('player', [6, 0.95, 0]);
    window.__TEST__!.teleport('opponent', [11, 0.95, -5]);
    window.__TEST__!.setHandling!(0, 'dribble', 1);
  });
  const direction = createMovementTransform(config.camera.inputAngle).worldToStick(1, 0);
  await page.evaluate(
    (v) => window.__TEST__!.setInput({ moveX: v.x * 0.55, moveZ: v.z * 0.55 }),
    direction,
  );
  await expect
    .poll(() =>
      page.evaluate(
        () => (window.__TEST__!.getLocomotion!(0) as LocomotionSnapshot)?.importedWalk?.weight,
      ),
    )
    .toBeGreaterThan(0.98);
  const samples = await page.evaluate(async () => {
    const samples: {
      pose: CharacterPoseSnapshot;
      locomotion: LocomotionSnapshot;
      state: ReturnType<NonNullable<typeof window.__TEST__>['getState']>;
    }[] = [];
    const until = (window.__TEST__!.getState().time as number) + 1.5;
    while ((window.__TEST__!.getState().time as number) < until) {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      samples.push({
        pose: window.__TEST__!.getCharacterPose!(0)!,
        locomotion: window.__TEST__!.getLocomotion!(0)!,
        state: window.__TEST__!.getState(),
      });
    }
    return samples;
  });
  await writeFile(
    info.outputPath('in-game-walk.json'),
    JSON.stringify({ models, samples }, null, 2),
  );
  expect(models.some((url) => url.endsWith('/shaquille_oneal.glb'))).toBe(true);
  expect(models.some((url) => url.includes('/archives/'))).toBe(false);
  expect(samples.length).toBeGreaterThan(5);
  expect(samples.some((s) => s.locomotion.importedWalk!.applied > 0)).toBe(true);
  expect(
    new Set(samples.map((s) => s.locomotion.importedWalk!.phase.toFixed(2))).size,
  ).toBeGreaterThan(4);
  for (const sample of samples) {
    expect(sample.pose.bodyY).toBeCloseTo(config.physics.halfHeight + config.physics.radius, 2);
    expect(Math.min(sample.pose.leftSoleY, sample.pose.rightSoleY)).toBeGreaterThan(-0.025);
    expect(sample.pose.hands[0].error).toBeLessThan(0.025);
    expect((sample.state.player as { hand: number }).hand).toBe(1);
  }
  await page.screenshot({ path: info.outputPath('shaq-in-game-walking.png') });
  await page.evaluate(() => window.__TEST__!.setInput({ moveX: 0, moveZ: 0 }));
  await page.keyboard.press('q');
  await expect
    .poll(() => page.evaluate(() => (window.__TEST__!.getState().player as { mode: string }).mode))
    .toBe('post');
  await expect
    .poll(() => page.evaluate(() => window.__TEST__!.getLocomotion!(0)?.importedWalk?.weight))
    .toBe(0);
  const postStarted = await page.evaluate(() => window.__TEST__!.getState().time as number);
  await expect
    .poll(() => page.evaluate(() => window.__TEST__!.getState().time as number))
    .toBeGreaterThan(postStarted + 0.7);
  const postPose = await page.evaluate(() => window.__TEST__!.getCharacterPose!(0)!);
  expect(Math.min(postPose.leftSoleY, postPose.rightSoleY)).toBeGreaterThan(-0.025);
  expect(postPose.hands[0].error).toBeLessThan(0.025);
  await page.screenshot({ path: info.outputPath('shaq-in-game-existing-post-ik.png') });
  expect(errors).toEqual([]);
});

test('off-ball Shaq uses authored arm swing as well as legs in the actual game scene', async ({
  page,
}, info) => {
  await page.goto('./');
  await page.waitForFunction(
    () => window.__TEST__?.ready && window.__TEST__.getEntities().length >= 3,
  );
  await page.evaluate(async () => {
    window.__TEST__!.setDebugFlag('testMode', true);
    await window.__TEST__!.reset(42, 'live');
    window.__TEST__!.teleport('player', [4, 0.95, 0]);
    window.__TEST__!.teleport('opponent', [11, 0.95, -5]);
    window.__TEST__!.teleport('ball', [1.8, 0.13, -6]);
  });
  const v = createMovementTransform(config.camera.inputAngle).worldToStick(1, 0);
  await page.evaluate(
    (v) => window.__TEST__!.setInput({ moveX: v.x * 0.55, moveZ: v.z * 0.55 }),
    v,
  );
  await expect
    .poll(() => page.evaluate(() => window.__TEST__!.getLocomotion!(0)?.importedWalk?.weight))
    .toBeGreaterThan(0.98);
  for (const [view, start, end] of [
    ['front', 0.15, 0.35],
    ['side', 0.6, 0.85],
  ] as const) {
    await page.evaluate((view) => window.__TEST__!.inspectCharacter!(view), view);
    await page.waitForFunction(
      ([start, end]) => {
        const phase = window.__TEST__!.getLocomotion!(0)?.importedWalk?.phase ?? -1;
        return phase >= start && phase < end;
      },
      [start, end],
    );
    await page.evaluate(() => {
      window.__PAUSED__ = true;
    });
    const frame = await page.evaluate(() => ({
      pose: window.__TEST__!.getCharacterPose!(0),
      locomotion: window.__TEST__!.getLocomotion!(0),
      state: window.__TEST__!.getState(),
    }));
    expect(frame.locomotion!.upper).toBe('relaxed');
    expect(frame.locomotion!.importedWalk!.applied).toBe(18);
    expect(Math.min(frame.pose!.leftSoleY, frame.pose!.rightSoleY)).toBeGreaterThan(-0.025);
    await writeFile(info.outputPath(`off-ball-${view}.json`), JSON.stringify(frame, null, 2));
    await page.screenshot({ path: info.outputPath(`off-ball-${view}.png`) });
    await page.evaluate(() => {
      window.__PAUSED__ = false;
    });
  }
});
