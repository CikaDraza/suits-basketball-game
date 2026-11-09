import { expect, test, type Page } from '@playwright/test';
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
      const target = seam.project!([
        p.x + sign * (side ? Math.cos(p.angle) : Math.sin(p.angle)),
        1.3,
        p.z + sign * (side ? -Math.sin(p.angle) : Math.cos(p.angle)),
      ]);
      const dx = target.x - center.x,
        dy = target.y - center.y,
        length = Math.hypot(dx, dy);
      window.__defenseAxes[slot][2] = dx / length;
      window.__defenseAxes[slot][3] = dy / length;
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
  if (kind === 'up')
    await expect.poll(async () => (await readPlayer(page, slot)).defenseHands).toBe('wave');
}

for (const legend of ['shaq', 'chuck'] as const) {
  test(`${legend}: both defenders hold anatomical arm poses, wave, and clear on neutral/pause/reconnect`, async ({
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
      for (const [index, hands] of (['left', 'right', 'up', 'brace', 'wave'] as const).entries()) {
        await direction(page, slot, 'none');
        await page.evaluate(({ slot, angle }) => window.__TEST__!.setFacing!(slot, angle), {
          slot,
          angle: (index * Math.PI) / 2,
        });
        const before = await readPlayer(page, slot);
        if (hands === 'wave') await doubleFlick(page, slot, 'up');
        else await direction(page, slot, hands);
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
          const contacts = await page.evaluate(
            (slot) => window.__TEST__!.getHandContacts!(slot),
            slot,
          );
          const normal = contacts[hands === 'left' ? 0 : 1].normal;
          expect(
            normal.x * Math.sin(before.angle) + normal.z * Math.cos(before.angle),
          ).toBeGreaterThan(0.85);
        } else if (hands === 'brace') {
          for (const point of [left, right]) {
            const ahead =
              (point.x - before.x) * Math.sin(before.angle) +
              (point.z - before.z) * Math.cos(before.angle);
            expect(ahead).toBeGreaterThan(0.2);
          }
        } else {
          expect(left.y - leftShoulder.y).toBeGreaterThan(0.35);
          expect(right.y - rightShoulder.y).toBeGreaterThan(0.35);
          if (hands === 'wave') {
            const frames = await page.evaluate(async (slot) => {
              const poses = [];
              for (let i = 0; i < 8; i++) {
                await new Promise((resolve) => setTimeout(resolve, 65));
                poses.push(window.__TEST__!.getCharacterPose!(slot)!.joints);
              }
              return poses;
            }, slot);
            for (const name of ['LeftHand', 'RightHand']) {
              const points = frames.map((frame) => frame[name]);
              const distance = Math.max(
                ...points.map((p) =>
                  Math.hypot(p.x - points[0].x, p.y - points[0].y, p.z - points[0].z),
                ),
              );
              expect(distance).toBeGreaterThan(0.08);
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
    await doubleFlick(page, 0, 'up');
    await page.screenshot({ path: info.outputPath('defensive-wave.png') });
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
    // Forearm contact: a held rear pose cannot shove; a second flick commits one physical push.
    await direction(page, 0, 'none');
    await page.evaluate(() => {
      window.__TEST__!.teleport('player', [6, 0.95, 0]);
      window.__TEST__!.teleport('opponent', [6, 0.95, 1.05]);
      window.__TEST__!.setFacing!(0, 0);
    });
    await direction(page, 0, 'brace');
    await page.waitForTimeout(450);
    expect((await page.evaluate(() => window.__TEST__!.getState())).defensePushes).toBe(0);
    await page.screenshot({ path: info.outputPath('forearm-check.png') });
    await direction(page, 0, 'none');
    await doubleFlick(page, 0, 'brace');
    await expect.poll(() => page.evaluate(() => window.__TEST__!.getState().defensePushes)).toBe(1);
    await expect.poll(async () => (await readPlayer(page, 1)).z).toBeGreaterThan(1.3);
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
