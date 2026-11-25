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
      const target = seam.project!([p.x + Math.sin(p.angle), 1.3, p.z + Math.cos(p.angle)]);
      const dx = target.x - center.x,
        dz = center.y - target.y;
      const length = Math.hypot(dx, dz);
      const vector =
        direction === 'side'
          ? [(-hand * dz) / length, (-hand * dx) / length]
          : [(sign * dx) / length, (-sign * dz) / length];

      window.__comboAxes[2] = vector[0];
      window.__comboAxes[3] = vector[1];
      const frames: Snapshot[] = [start];
      let released = false,
        second = false,
        movementStartedAt: number | undefined;
      while ((seam.getState().time as number) < start.time + (moving ? 2.4 : 1.65)) {
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        const s = seam.getState() as unknown as Snapshot;
        frames.push(s);
        if (moving && s.ballControl.skill?.started) movementStartedAt ??= s.time;
        if (movementStartedAt !== undefined) {
          const elapsed = s.time - movementStartedAt;
          window.__comboAxes[0] = elapsed < 0.5 ? moving : elapsed < 1.4 ? -moving : 0;
          window.__comboAxes[2] = window.__comboAxes[3] = 0;
        }
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

for (const legend of ['shaq', 'chuck'] as const) {
  test(`${legend}: first RS dribble retains possession through full LS movement, reversal and stop`, async ({
    page,
  }) => {
    await installPad(page);
    await bootGame(page);
    await page.evaluate((legend) => window.__TEST__!.setLegend!(0, legend), legend);
    for (const hand of [1, -1] as const) {
      await setup(page, hand, 42, true);
      const frames = await perform(page, 'front', hand, false, 1);
      expect(frames.some((s) => s.ballControl.skill?.started)).toBe(true);
      expect(frames.every((s) => s.ball.owner === 0 && s.fumbles === 0)).toBe(true);
      expect(
        frames.some((s) => Math.abs((s.ballControl.lastFloorY ?? 1) - config.ball.radius) < 0.001),
      ).toBe(true);
      expect(frames.at(-1)!.ballControl.skill).toBeNull();
      const positions = frames.map((s) => s.player.x);
      expect(Math.max(...positions) - positions[0]).toBeGreaterThan(0.1);
      expect(Math.max(...positions) - positions.at(-1)!).toBeGreaterThan(0.1);
    }
  });
}
