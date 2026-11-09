import { expect, test, type Page } from '@playwright/test';
import { config } from '../../src/game/data/gameConfig';
import { bootGame } from './helpers';

// Keep rapid flicks observable on the software renderer used in browser tests.
test.use({ viewport: { width: 800, height: 450 } });

type Hand = 1 | -1;
type Direction = 'side' | 'front' | 'behind';
type Snapshot = {
  time: number;
  player: { x: number; z: number; angle: number; hand: Hand };
  ball: {
    state: string;
    owner: number;
    x: number;
    z: number;
    gravityScale: number;
    sensor: boolean;
    velocity: { x: number; y: number; z: number };
  };
  ballControl: {
    phase: number;
    hand: Hand;
    local: { x: number; z: number };
    lastFloorY: number | null;
    skill: { kind: Direction; started: boolean; completed: number; total: number } | null;
  };
  skillInput: { activations: number; last: { kind: Direction; double?: boolean } | null }[];
  fumbles: number;
};

declare global {
  interface Window {
    __comboAxes: number[];
  }
}

async function installPad(page: Page) {
  await page.addInitScript(() => {
    window.__comboAxes = [0, 0, 0, 0];
    Object.defineProperty(navigator, 'getGamepads', {
      configurable: true,
      value: () => [
        {
          id: 'Combo gamepad',
          index: 0,
          connected: true,
          mapping: 'standard',
          axes: [...window.__comboAxes],
          timestamp: performance.now(),
          buttons: Array.from({ length: 16 }, () => ({ pressed: false, touched: false, value: 0 })),
        },
      ],
    });
  });
}

async function setup(page: Page, hand: Hand, seed = 42, hold = false) {
  await page.evaluate(
    async ({ hand, seed, hold }) => {
      window.__comboAxes = [0, 0, 0, 0];
      await window.__TEST__!.reset(seed, 'live');
      window.__TEST__!.teleport('player', [6, 0.95, 0]);
      window.__TEST__!.teleport('opponent', [12, 0.95, -5]);
      window.__TEST__!.setHandling!(0, hold ? 'hold' : 'dribble', hand);
    },
    { hand, seed, hold },
  );
  const from = await page.evaluate(() => window.__TEST__!.getState().time as number);
  await expect
    .poll(() => page.evaluate(() => window.__TEST__!.getState().time as number))
    .toBeGreaterThan(from + 0.8);
}

async function perform(
  page: Page,
  direction: Direction,
  hand: Hand,
  double = false,
  moving = 0,
  secondDelay = 0.18,
) {
  return page.evaluate(
    async ({ direction, hand, double, moving, secondDelay }) => {
      const seam = window.__TEST__!;
      const start = seam.getState() as unknown as Snapshot;
      const p = start.player;
      const center = seam.project!([p.x, 1.3, p.z]);
      const sign = direction === 'behind' ? -1 : 1;
      const target = seam.project!([
        p.x + (direction === 'side' ? hand * Math.cos(p.angle) : sign * Math.sin(p.angle)),
        1.3,
        p.z + (direction === 'side' ? -hand * Math.sin(p.angle) : sign * Math.cos(p.angle)),
      ]);
      const dx = target.x - center.x,
        dz = center.y - target.y;
      const length = Math.hypot(dx, dz);
      const vector = [dx / length, -dz / length];
      window.__comboAxes[0] = moving;
      window.__comboAxes[2] = vector[0];
      window.__comboAxes[3] = vector[1];
      const frames: Snapshot[] = [start];
      let released = false,
        second = false;
      while ((seam.getState().time as number) < start.time + 1.65) {
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        const s = seam.getState() as unknown as Snapshot;
        frames.push(s);
        if (double && !released && s.time - start.time >= 0.08) {
          window.__comboAxes[2] = window.__comboAxes[3] = 0;
          released = true;
        } else if (double && released && !second && s.time - start.time >= secondDelay) {
          window.__comboAxes[2] = vector[0];
          window.__comboAxes[3] = vector[1];
          second = true;
        }
      }
      window.__comboAxes = [0, 0, 0, 0];
      return frames;
    },
    { direction, hand, double, moving, secondDelay },
  );
}

for (const legend of ['shaq', 'chuck'] as const) {
  test(`${legend}: right stick performs same-hand doubles, front combos and single/double behind-back combos`, async ({
    page,
  }, info) => {
    test.setTimeout(90_000);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await installPad(page);
    await bootGame(page);
    await page.bringToFront();
    await page.locator('canvas').click({ position: { x: 10, y: 10 } });
    await page.evaluate((legend) => window.__TEST__!.setLegend!(0, legend), legend);
    for (const initial of [1, -1] as const) {
      for (const [kind, double, switches] of [
        ['side', false, 0],
        ['front', false, 3],
        ['behind', false, 1],
        ['behind', true, 3],
      ] as const) {
        await setup(page, initial);
        const frames = await perform(page, kind, initial, double);
        const active = frames.filter((s) => s.ballControl.skill?.started);
        expect(active.length, `${kind}: an active move was rendered`).toBeGreaterThan(0);
        const hands = [initial];
        for (const s of frames)
          if (s.ballControl.hand !== hands.at(-1)) hands.push(s.ballControl.hand);
        expect(hands.length - 1, `${kind}, double=${double}, initial=${initial}`).toBe(switches);
        expect(frames.at(-1)!.ballControl.skill).toBeNull();
        expect(frames.at(-1)!.player.hand).toBe(switches % 2 ? -initial : initial);
        expect(frames.at(-1)!.ball.owner).toBe(0);
        expect(frames.at(-1)!.fumbles).toBe(0);
        expect(frames.at(-1)!.skillInput[0].activations).toBe(double ? 2 : 1);
        if (kind === 'side') {
          expect(Math.max(...active.map((s) => s.ballControl.skill!.completed))).toBe(1);
          expect(Math.max(...active.map((s) => Math.abs(s.ballControl.local.x)))).toBeGreaterThan(
            0.5,
          );
        }
        if (kind === 'behind')
          expect(Math.min(...active.map((s) => s.ballControl.local.z))).toBeLessThan(0);
      }
    }
    await setup(page, 1, 42, true);
    const heldRear = await perform(page, 'behind', 1);
    const hands: Hand[] = [1];
    for (const s of heldRear)
      if (s.ballControl.hand !== hands.at(-1)) hands.push(s.ballControl.hand);
    expect(hands).toEqual([1, -1]);
    expect(
      heldRear.some((s) => Math.abs((s.ballControl.lastFloorY ?? 1) - config.ball.radius) < 0.001),
    ).toBe(true);
    await page.screenshot({ path: info.outputPath('completed-combos.png') });
    expect(errors).toEqual([]);
  });
}

test('complex dribble is controlled below full movement and physically escapes at full left-stick deflection', async ({
  page,
}) => {
  await installPad(page);
  await bootGame(page);
  await setup(page, 1);
  const controlled = await perform(page, 'front', 1, false, 0.6);
  expect(controlled.at(-1)!.fumbles).toBe(0);
  expect(controlled.every((s) => s.ball.owner === 0)).toBe(true);
  await setup(page, 1, 42);
  const fullSpeed = await perform(page, 'front', 1, false, 1);
  const lost = fullSpeed.find((s) => s.ball.state === 'loose');
  expect(lost).toBeDefined();
  expect(lost!.ball.owner).toBe(-1);
  expect(lost!.ball.gravityScale).toBe(1);
  expect(lost!.ball.sensor).toBe(false);
  expect(Math.hypot(lost!.ball.velocity.x, lost!.ball.velocity.z)).toBeGreaterThan(0.5);
  expect(fullSpeed.at(-1)!.fumbles).toBe(1);
  expect(
    Math.max(...fullSpeed.map((s) => Math.hypot(s.ball.x - s.player.x, s.ball.z - s.player.z))),
  ).toBeGreaterThan(0.6);
  expect(fullSpeed.at(-1)!.skillInput[0].activations).toBe(1);
});
