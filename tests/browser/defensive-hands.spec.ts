import { expect, test, type Page } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { bootGame } from './helpers';
import type { DefensiveHands } from '../../src/game/input/defensiveHands';
import type { CharacterPoseSnapshot } from '../../src/game/harness/characterPose';

test.use({ viewport: { width: 800, height: 450 } });

declare global {
  interface Window {
    __defenseAxes: number[][];
    __defenseConnected: boolean[];
  }
}

type Player = {
  x: number;
  z: number;
  angle: number;
  defenseHands: DefensiveHands;
  defensePushAt: number;
};
async function readPlayer(page: Page, slot: number) {
  return page.evaluate(
    (slot) => window.__TEST__!.getState()[slot === 0 ? 'player' : 'opponent'] as Player,
    slot,
  );
}
async function direction(page: Page, slot: number, hands: DefensiveHands) {
  await page.evaluate(
    ({ slot, hands }) => {
      const seam = window.__TEST__!;
      const p = seam.getState()[slot === 0 ? 'player' : 'opponent'] as Player;
      if (hands === 'none') {
        window.__defenseAxes[slot] = [0, 0, 0, 0];
        return;
      }
      const side = hands === 'left' || hands === 'right';
      const sign = hands === 'right' || hands === 'brace' ? -1 : 1;
      const center = seam.project!([p.x, 1.3, p.z]);
      const target = seam.project!([p.x + Math.sin(p.angle), 1.3, p.z + Math.cos(p.angle)]);
      const dx = target.x - center.x,
        dy = target.y - center.y,
        length = Math.hypot(dx, dy);
      window.__defenseAxes[slot][2] = (sign * (side ? dy : dx)) / length;
      window.__defenseAxes[slot][3] = (sign * (side ? -dx : dy)) / length;
    },
    { slot, hands },
  );
  if (hands === 'none')
    await page.evaluate(
      () =>
        new Promise<void>((resolve) => {
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
        }),
    );
  await expect.poll(async () => (await readPlayer(page, slot)).defenseHands).toBe(hands);
}

async function doubleFlick(page: Page, slot: 0 | 1, kind: 'up' | 'brace') {
  await page.evaluate(
    async ({ slot, kind }) => {
      const seam = window.__TEST__!;
      const player = () => seam.getState()[slot === 0 ? 'player' : 'opponent'] as Player;
      const frame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const stick = (active: boolean) => {
        if (!active) {
          window.__defenseAxes[slot] = [0, 0, 0, 0];
          return;
        }
        const p = player(),
          sign = kind === 'up' ? 1 : -1;
        const center = seam.project!([p.x, 1.3, p.z]);
        const target = seam.project!([
          p.x + sign * Math.sin(p.angle),
          1.3,
          p.z + sign * Math.cos(p.angle),
        ]);
        const dx = target.x - center.x,
          dy = target.y - center.y,
          length = Math.hypot(dx, dy);
        window.__defenseAxes[slot] = [0, 0, dx / length, dy / length];
      };
      stick(false);
      await frame();
      await frame();
      stick(true);
      for (let n = 0; n < 30 && player().defenseHands !== kind; n++) await frame();
      stick(false);
      for (let n = 0; n < 30 && player().defenseHands !== 'none'; n++) await frame();
      stick(true);
      await frame();
      await frame();
    },
    { slot, kind },
  );
}

for (const legend of ['shaq', 'chuck'] as const) {
  test(`${legend}: both defenders hold anatomical arm poses and clear on neutral/pause/reconnect`, async ({
    page,
  }, info) => {
    test.setTimeout(90_000);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('response', (response) => {
      if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`);
    });
    await page.addInitScript(() => {
      window.__defenseAxes = [
        [0, 0, 0, 0],
        [0, 0, 0, 0],
      ];
      window.__defenseConnected = [true, true];
      Object.defineProperty(navigator, 'getGamepads', {
        configurable: true,
        value: () =>
          window.__defenseAxes.map((axes, index) => ({
            id: `Defense pad ${index}`,
            index,
            connected: window.__defenseConnected[index],
            mapping: 'standard',
            timestamp: performance.now(),
            axes: [...axes],
            buttons: Array.from({ length: 16 }, () => ({
              pressed: false,
              value: 0,
              touched: false,
            })),
          })),
      });
    });
    await bootGame(page);
    await page.evaluate(() => window.__TEST__!.diagnostics!.start());
    await page.bringToFront();
    await page.evaluate(async (legend) => {
      window.__TEST__!.setLegend!(0, legend);
      window.__TEST__!.setLegend!(1, legend);
      await window.__TEST__!.reset(42, 'live');
      window.__TEST__!.teleport('player', [6, 0.95, 0]);
      window.__TEST__!.teleport('opponent', [9, 0.95, 2]);
      window.__TEST__!.teleport('ball', [11, 1, -5]);
    }, legend);
    for (const slot of [0, 1] as const) {
      for (const [index, hands] of (['left', 'right', 'up', 'brace'] as const).entries()) {
        await direction(page, slot, 'none');
        await page.evaluate(({ slot, angle }) => window.__TEST__!.setFacing!(slot, angle), {
          slot,
          angle: (index * Math.PI) / 2,
        });
        const before = await readPlayer(page, slot);
        await direction(page, slot, hands);
        await page.waitForTimeout(450);
        const pose = (await page.evaluate(
          (slot) => window.__TEST__!.getCharacterPose!(slot),
          slot,
        )) as CharacterPoseSnapshot;
        const {
          LeftHand: left,
          RightHand: right,
          LeftArm: leftShoulder,
          RightArm: rightShoulder,
        } = pose.joints;
        if (hands === 'left' || hands === 'right') {
          const hand = hands === 'left' ? left : right;
          const shoulder = hands === 'left' ? leftShoulder : rightShoulder;
          const side =
            (hand.x - shoulder.x) * Math.cos(before.angle) -
            (hand.z - shoulder.z) * Math.sin(before.angle);
          expect(side * (hands === 'left' ? 1 : -1)).toBeGreaterThan(0.35);
          expect(Math.abs(hand.y - shoulder.y)).toBeLessThan(0.3);
          const active = hands === 'left' ? 0 : 1;
          expect(pose.defensiveArms[active].elbowFlex).toBeLessThan(18);
          expect(pose.defensiveArms[active].elbowPlaneError).toBeLessThan(1);
          const guard = pose.defensiveArms[1 - active];
          expect(guard.elbowFlex).toBeGreaterThan(85);
          expect(guard.wrist.y).toBeGreaterThan(guard.elbow.y);
          expect(guard.wrist.y).toBeLessThan(guard.shoulder.y - 0.1);
          expect(
            (guard.wrist.x - guard.shoulder.x) * Math.sin(before.angle) +
              (guard.wrist.z - guard.shoulder.z) * Math.cos(before.angle),
          ).toBeGreaterThan(0.25);
          const contacts = await page.evaluate(
            (slot) => window.__TEST__!.getHandContacts!(slot),
            slot,
          );
          const normal = contacts[hands === 'left' ? 0 : 1].normal;
          expect(
            normal.x * Math.sin(before.angle) + normal.z * Math.cos(before.angle),
          ).toBeGreaterThan(0.85);
        } else if (hands === 'brace') {
          const contact = await page.evaluate(
            (slot) => window.__TEST__!.getLocomotion!(slot)!.contact!,
            slot,
          );
          const active = contact.selectedArm === 'left' ? 0 : 1;
          expect(pose.defensiveArms[active].elbowFlex).toBeGreaterThan(75);
          expect(pose.defensiveArms[active].elbowFlex).toBeLessThan(110);
          expect(Math.abs(pose.defensiveArms[active].foreDirection.y)).toBeLessThan(0.35);
          expect(pose.defensiveArms[1 - active].elbowFlex).toBeLessThan(18);
        } else {
          for (const [i, arm] of pose.defensiveArms.entries()) {
            expect(arm.elbowPlaneError).toBeLessThan(1);
            expect(pose.hands[i].palm.y - pose.joints.Head.y).toBeGreaterThan(0.4);
            if (hands === 'up') {
              expect(arm.elbowFlex).toBeLessThan(12);
              expect(
                (pose.hands[i].palm.y - arm.shoulder.y) /
                  (arm.maximumOverheadPalmY - arm.shoulder.y),
              ).toBeGreaterThan(0.97);
            }
          }
        }
        const after = await readPlayer(page, slot);
        expect(Math.hypot(after.x - before.x, after.z - before.z)).toBeLessThan(0.02);
        expect(after.angle).toBeCloseTo(before.angle, 5);
      }
      await direction(page, slot, 'none');
    }
    await direction(page, 0, 'up');
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await expect.poll(async () => (await readPlayer(page, 0)).defenseHands).toBe('none');
    await direction(page, 0, 'none');
    await direction(page, 0, 'up');
    await page.evaluate(() => {
      window.__defenseConnected[0] = false;
    });
    await expect.poll(async () => (await readPlayer(page, 0)).defenseHands).toBe('none');
    await page.evaluate(() => {
      window.__defenseConnected[0] = true;
    });
    await page.waitForTimeout(200);
    expect((await readPlayer(page, 0)).defenseHands).toBe('none');
    await direction(page, 0, 'none');
    await direction(page, 0, 'left');
    // Forearm contact: a held rear pose cannot shove; a double forward flick commits one physical push.
    await direction(page, 0, 'none');
    await page.evaluate(() => {
      window.__TEST__!.teleport('player', [6, 0.95, 0]);
      window.__TEST__!.teleport('opponent', [6, 0.95, 0.85]);
      window.__TEST__!.setFacing!(0, 0);
    });
    await direction(page, 0, 'brace');
    await page.waitForTimeout(450);
    expect((await page.evaluate(() => window.__TEST__!.getState())).defensePushes).toBe(0);
    await page.screenshot({ path: info.outputPath('forearm-check.png') });
    await direction(page, 0, 'none');
    await doubleFlick(page, 0, 'up');
    await page.waitForTimeout(700);
    await writeFile(
      info.outputPath('push-contact.json'),
      JSON.stringify(
        await page.evaluate(() => ({
          runtime: window.__TEST__!.getState(),
          pose: window.__TEST__!.getCharacterPose!(0),
          gait: window.__TEST__!.getLocomotion!(0),
          observed: window.__TEST__!.getGameplayDebug!(0),
          recording: window.__TEST__!.diagnostics!.export(),
        })),
        null,
        2,
      ),
    );
    await expect.poll(() => page.evaluate(() => window.__TEST__!.getState().defensePushes)).toBe(1);
    await expect.poll(async () => (await readPlayer(page, 1)).z).toBeGreaterThan(1.05);
    await page.waitForTimeout(650);
    expect((await page.evaluate(() => window.__TEST__!.getState())).defensePushes).toBe(1);
    await page.screenshot({ path: info.outputPath('forearm-push.png') });
    await page.evaluate(async () => {
      await window.__TEST__!.reset(42, 'live');
    });
    await expect.poll(async () => (await readPlayer(page, 0)).defenseHands).toBe('none');
    expect(errors).toEqual([]);
  });
}
