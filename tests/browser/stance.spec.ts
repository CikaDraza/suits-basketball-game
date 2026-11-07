import { expect, test } from '@playwright/test';
import type { CharacterPoseSnapshot } from '../../src/game/harness/characterPose';
import { bootGame } from './helpers';

function expectGrounded(pose: CharacterPoseSnapshot): void {
  // Rapier's normal resting contact slop is ~1.2 mm; 1 cm catches the old 16 cm error.
  expect(pose.capsuleBottomY).toBeGreaterThan(-0.01);
  for (const sole of [pose.leftSoleY, pose.rightSoleY]) {
    expect(sole).toBeGreaterThan(-0.01);
    expect(sole).toBeLessThan(0.025);
  }
}

for (const legend of ['shaq', 'chuck'] as const) {
  test(`${legend}: Q lowers the hips while soles stay on the court and the capsule stays fixed`, async ({
    page,
  }, info) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await bootGame(page);
    await page.bringToFront();
    await page.locator('canvas').click({ position: { x: 10, y: 10 } });
    await page.evaluate(async (legend) => {
      window.__TEST__!.setLegend!(0, legend);
      await window.__TEST__!.reset(42);
      window.__TEST__!.setDebugFlag('colliders', true);
    }, legend);
    await page.waitForFunction(() => (window.__TEST__!.getState().time as number) > 0.5);
    const idle = await page.evaluate(() => window.__TEST__!.getCharacterPose!(0));
    expect(idle).not.toBeNull();
    expectGrounded(idle!);

    await page.keyboard.down('q');
    try {
      await expect
        .poll(() =>
          page.evaluate(() => (window.__TEST__!.getState().player as { mode: string }).mode),
        )
        .toBe('post');
    } finally {
      await page.keyboard.up('q');
    }

    // Sample the actual skinned shoes during the blend, not just bone origins in the final pose.
    const blend = await page.evaluate(async () => {
      const samples: CharacterPoseSnapshot[] = [];
      const until = (window.__TEST__!.getState().time as number) + 0.6;
      while ((window.__TEST__!.getState().time as number) < until) {
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        const pose = window.__TEST__!.getCharacterPose!(0);
        if (pose) samples.push(pose);
      }
      return samples;
    });
    expect(blend.length).toBeGreaterThan(2);
    for (const pose of blend) expectGrounded(pose);
    const post = blend.at(-1)!;
    expect(post.bodyY).toBeCloseTo(idle!.bodyY, 3);
    expect(post.capsuleHalfHeight).toBe(idle!.capsuleHalfHeight);
    expect(post.capsuleRadius).toBe(idle!.capsuleRadius);
    expect(post.hipsWorldY).toBeLessThan(idle!.hipsWorldY - 0.1);
    await page.screenshot({ path: info.outputPath(`${legend}-post-debug.png`) });

    await page.keyboard.down('q');
    try {
      await expect
        .poll(() =>
          page.evaluate(() => (window.__TEST__!.getState().player as { mode: string }).mode),
        )
        .toBe('idle');
    } finally {
      await page.keyboard.up('q');
    }
    await expect
      .poll(() => page.evaluate(() => window.__TEST__!.getCharacterPose!(0)!.hipsWorldY))
      .toBeGreaterThan(idle!.hipsWorldY - 0.02);
    expectGrounded((await page.evaluate(() => window.__TEST__!.getCharacterPose!(0)))!);
    expect(errors).toEqual([]);
  });
}
