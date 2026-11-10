import { mkdir, writeFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { bootGame } from './helpers';
import type { CharacterPoseSnapshot } from '../../src/game/harness/characterPose';
import { config } from '../../src/game/data/gameConfig';
import { createMovementTransform } from '../../src/game/simulation/coordinates';

test.use({ viewport: { width: 1400, height: 1000 } });
const phase = process.env.DEF_ARM_REVIEW_PHASE ?? 'after';
const directory = `playtest/def-arm-fix-1/${phase}`;
const poses = ['ready', 'wide', 'left', 'right', 'up', 'brace', 'wave'] as const;
const movement = createMovementTransform(
  Math.atan2(
    config.camera.position[0] - config.camera.target[0],
    config.camera.position[2] - config.camera.target[2],
  ),
);

function checkAnatomy(pose: CharacterPoseSnapshot, mode: string) {
  expect(pose.defensiveArms).toHaveLength(2);
  for (const [i, a] of pose.defensiveArms.entries()) {
    expect(a.weight).toBeGreaterThan(0.99);
    expect(a.elbowPlaneError).toBeLessThan(1);
    expect(a.contactError).toBeLessThan(0.01);
    const length = a.upperLength + a.foreLength;
    const distance = (p: { x: number; y: number; z: number }, q: typeof p) =>
      Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z);
    expect(distance(a.shoulder, a.elbow)).toBeCloseTo(a.upperLength, 4);
    expect(distance(a.elbow, a.wrist)).toBeCloseTo(a.foreLength, 4);
    if (mode === 'wide' || mode === (i === 0 ? 'left' : 'right')) {
      expect(a.elbowFlex).toBeLessThan(16);
      expect(distance(a.shoulder, a.wrist) / length).toBeGreaterThan(0.985);
      expect(pose.hands[i].normal.z).toBeGreaterThan(0.97);
    } else if (mode === 'up') {
      expect(a.elbowFlex).toBeLessThan(12);
      expect(pose.hands[i].palm.y - pose.joints.Head.y).toBeGreaterThan(0.4);
      expect(
        (pose.hands[i].palm.y - a.shoulder.y) / (a.maximumOverheadPalmY - a.shoulder.y),
      ).toBeGreaterThan(0.97);
    } else if (mode === 'ready' || mode === 'left' || mode === 'right') {
      expect(a.elbowFlex).toBeGreaterThan(85);
      expect(a.elbowFlex).toBeLessThan(105);
      expect(a.wrist.y - a.elbow.y).toBeGreaterThan(length * 0.15);
    }
  }
}

for (const legend of ['shaq', 'chuck'] as const) {
  test(`${legend}: DEF-ARM-FIX-1 ${phase} pose review from front, side and rear`, async ({
    page,
  }) => {
    test.setTimeout(150_000);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await mkdir(directory, { recursive: true });
    await bootGame(page);
    await expect(page.locator('.rotate-device')).not.toBeVisible();
    await page.bringToFront();
    await page.evaluate(async (legend) => {
      window.__TEST__!.setLegend!(0, legend);
      await window.__TEST__!.reset(42, 'live');
      window.__TEST__!.teleport('opponent', [6, 0.95, 1.1]);
      window.__TEST__!.teleport('player', [6, 0.95, 0]);
      window.__TEST__!.teleport('ball', [11, 1, -5]);
    }, legend);
    await page.evaluate(() => {
      window.__TEST__!.teleport('player', [6, 0.95, 0]);
      window.__TEST__!.teleport('opponent', [6, 0.95, 1.1]);
      window.__TEST__!.setFacing!(0, 0);
      window.__TEST__!.inspectCharacter!('front');
    });
    await page.addStyleTag({
      content: '.hud, [aria-label="Game controls"] { visibility:hidden!important; }',
    });
    const measurements: unknown[] = [];
    for (const pose of poses) {
      await page.evaluate((pose) => window.__TEST__!.setDefensivePose!(0, pose), pose);
      await page.waitForTimeout(650);
      if (phase === 'after') {
        await expect
          .poll(() =>
            page.evaluate(
              () =>
                window.__TEST__!.getCharacterPose!(0)?.defensiveArms.every(
                  (a) => a.weight > 0.99,
                ) ?? false,
            ),
          )
          .toBe(true);
      }
      for (const view of ['front', 'side', 'rear'] as const) {
        await page.evaluate((view) => window.__TEST__!.inspectCharacter!(view), view);
        await page.waitForTimeout(140);
        const character = await page.evaluate(() => window.__TEST__!.getCharacterPose!(0));
        if (phase === 'after') checkAnatomy(character!, pose);
        measurements.push({
          pose,
          view,
          character,
          locomotion: await page.evaluate(() => window.__TEST__!.getLocomotion!(0)),
        });
        await page.screenshot({ path: `${directory}/${legend}-${pose}-${view}.png` });
      }
    }
    await writeFile(
      `${directory}/${legend}-measurements.json`,
      JSON.stringify(measurements, null, 2),
    );
    expect(errors).toEqual([]);
  });
}

if (phase === 'after')
  for (const legend of ['shaq', 'chuck'] as const) {
    test(`${legend}: defensive walking, transitions and forearm recovery from three angles`, async ({
      page,
    }) => {
      test.setTimeout(150_000);
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await bootGame(page);
      await page.evaluate(async (legend) => {
        const seam = window.__TEST__!;
        seam.setLegend!(0, legend);
        await seam.reset(42, 'live');
        seam.teleport('ball', [12, 1, -6]);
        seam.teleport('opponent', [11, 0.95, -5]);
        seam.teleport('player', [5, 0.95, 0]);
        seam.setFacing!(0, 0);
      }, legend);
      await page.addStyleTag({ content: '.hud, .touch-controls {visibility:hidden!important}' });
      const records: unknown[] = [];
      for (const view of ['front', 'side', 'rear'] as const) {
        await page.evaluate((view) => {
          const seam = window.__TEST__!;
          seam.setInput({ moveX: 0, moveZ: 0 });
          seam.teleport('player', [5, 0.95, 0]);
          seam.setFacing!(0, 0);
          seam.inspectCharacter!(view);
          seam.setDefensivePose!(0, 'up');
        }, view);
        await page.waitForTimeout(650);
        const stick = movement.worldToStick(0, 1);
        await page.evaluate(
          // Stay below the game's fatigue threshold so a scripted review cannot stun itself.
          (stick) => window.__TEST__!.setInput({ moveX: stick.x * 0.45, moveZ: stick.z * 0.45 }),
          stick,
        );
        await expect
          .poll(() =>
            page.evaluate(() => {
              const seam = window.__TEST__!,
                gait = seam.getLocomotion!(0),
                pose = seam.getCharacterPose!(0);
              if (!gait || !pose) return false;
              return (
                gait.moving &&
                gait.speed > 0.3 &&
                pose.defensiveArms.every((a) => a.weight > 0.9999) &&
                (!gait.importedWalk || gait.importedWalk.weight > 0.7)
              );
            }),
          )
          .toBe(true);
        const frames = await page.evaluate(async () => {
          const out = [];
          for (let i = 0; i < 20; i++) {
            await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
            out.push({
              character: window.__TEST__!.getCharacterPose!(0)!,
              locomotion: window.__TEST__!.getLocomotion!(0)!,
            });
          }
          return out;
        });
        expect(frames.some((f) => f.locomotion.moving && f.locomotion.speed > 0.3)).toBe(true);
        for (const f of frames) {
          checkAnatomy(f.character, 'up');
          expect(Math.min(f.character.leftSoleY, f.character.rightSoleY)).toBeGreaterThan(-0.012);
          if (legend === 'shaq') {
            expect(f.locomotion.importedWalk!.weight).toBeGreaterThan(0.7);
            expect(f.locomotion.importedWalk!.appliedArms).toBe(0);
            expect(f.locomotion.importedWalk!.applied).toBeGreaterThan(0);
          }
        }
        records.push({ view, segment: 'walking-up', frames });
        await page.screenshot({ path: `${directory}/${legend}-walking-up-${view}.png` });
        for (const mode of ['left', 'right', 'brace', 'push', 'ready', 'none'] as const) {
          const frames = await page.evaluate(async (mode) => {
            window.__TEST__!.setDefensivePose!(0, mode);
            const out = [];
            for (let i = 0; i < (mode === 'push' ? 6 : 12); i++) {
              await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
              out.push(window.__TEST__!.getCharacterPose!(0)!);
            }
            return out;
          }, mode);
          expect(
            frames.every((f) =>
              f.defensiveArms.every(
                (a) =>
                  Number.isFinite(a.elbowFlex) &&
                  Number.isFinite(a.elbowPlaneError) &&
                  (mode === 'none' || (a.mode === mode && a.weight > 0.99)),
              ),
            ),
          ).toBe(true);
          records.push({ view, segment: mode, frames });
          await page.screenshot({ path: `${directory}/${legend}-transition-${mode}-${view}.png` });
        }
        await page.evaluate(() => window.__TEST__!.setInput({ moveX: 0, moveZ: 0 }));
      }
      await writeFile(
        `${directory}/${legend}-walking-transitions.json`,
        JSON.stringify(records, null, 2),
      );
      expect(errors).toEqual([]);
    });
  }
