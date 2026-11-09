import { expect, test, type Page } from '@playwright/test';
import { bootGame } from './helpers';
import { createDefaultProfile, type ControlProfile } from '../../src/game/input/controlBindings';

declare global {
  interface Window {
    __mockPad: { axes: number[]; pressed: number[]; connected: boolean };
  }
}

type Point = { x: number; y: number; z: number };
const state = (page: Page) => page.evaluate(() => window.__TEST__!.getState());
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

async function mockController(
  page: Page,
  calibrated = true,
  neutral = [0, 0, 0, 0, -1, -1],
  inboundButton?: number,
) {
  await page.addInitScript(
    ({ calibrated, defaults, neutral, inboundButton }) => {
      // Sparse hardware index plus nonstandard trigger axes resting at -1.
      window.__mockPad = { axes: [...neutral], pressed: [], connected: true };
      if (calibrated) {
        const saved = JSON.parse(localStorage.getItem('suits.controls.v1') ?? 'null') ?? defaults;
        saved.padNeutral ??= {};
        saved.padNeutral[JSON.stringify(['SUITS test controller', '', neutral.length])] = neutral;
        if (inboundButton !== undefined)
          saved.offense.gamepad.INBOUND = { kind: 'button', index: inboundButton };
        localStorage.setItem('suits.controls.v1', JSON.stringify(saved));
      }
      Object.defineProperty(navigator, 'getGamepads', {
        configurable: true,
        value: () => {
          const data = window.__mockPad;
          const pad = {
            id: 'SUITS test controller',
            index: 2,
            connected: data.connected,
            mapping: '',
            timestamp: performance.now(),
            axes: [...data.axes],
            buttons: Array.from({ length: 16 }, (_, index) => ({
              pressed: data.pressed.includes(index),
              touched: data.pressed.includes(index),
              value: data.pressed.includes(index) ? 1 : 0,
            })),
            vibrationActuator: null,
          };
          return [null, null, pad];
        },
      });
    },
    { calibrated, defaults: createDefaultProfile(), neutral, inboundButton },
  );
}

async function advance(page: Page, seconds = 0.3) {
  const from = (await state(page)).time as number;
  await expect.poll(async () => (await state(page)).time).toBeGreaterThan(from + seconds);
}

async function selectVisibleHand(page: Page, hand: 1 | -1, horizontal = 2, vertical = 3) {
  await page.evaluate(
    ({ hand, horizontal, vertical }) => {
      const p = window.__TEST__!.getState().player as { x: number; z: number; angle: number };
      const center = window.__TEST__!.project!([p.x, 1.3, p.z]);
      const side = window.__TEST__!.project!([
        p.x + hand * Math.cos(p.angle),
        1.3,
        p.z - hand * Math.sin(p.angle),
      ]);
      const dx = side.x - center.x,
        dy = side.y - center.y,
        length = Math.hypot(dx, dy);
      window.__mockPad.axes[horizontal] = dx / length;
      window.__mockPad.axes[vertical] = dy / length;
    },
    { hand, horizontal, vertical },
  );
}

async function openControls(page: Page) {
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'CONTROLS / KONTROLE' }).click();
  await expect(page.getByRole('heading', { name: 'KONTROLE.' })).toBeVisible();
}

async function savedProfile(page: Page) {
  return page.evaluate(
    () => JSON.parse(localStorage.getItem('suits.controls.v1') ?? 'null') as ControlProfile | null,
  );
}

for (const inboundButton of [0, 7]) {
  test(`inbound button ${inboundButton} passes once while triangle remains a stance command`, async ({
    page,
  }) => {
    await mockController(page, true, [0, 0, 0, 0, -1, -1], inboundButton);
    await bootGame(page);
    await page.bringToFront();
    await page.locator('canvas').click({ position: { x: 10, y: 10 } });
    await page.evaluate(async () => {
      await window.__TEST__!.reset(42, 'inbound');
      window.__TEST__!.teleport('player', [5, 0.95, 1.5]);
      window.__TEST__!.teleport('opponent', [2, 0.95, -2]);
    });
    await expect.poll(async () => (await state(page)).inbound).toMatchObject({ stage: 'pass' });
    await page.evaluate(() => (window.__mockPad.pressed = [3]));
    await expect.poll(async () => (await state(page)).player).toMatchObject({ mode: 'post' });
    await advance(page, 0.2);
    expect((await state(page)).passes).toBe(0);
    await page.evaluate(() => (window.__mockPad.pressed = []));
    await advance(page, 0.1);
    if (inboundButton !== 0) {
      await page.evaluate(() => (window.__mockPad.pressed = [0]));
      await advance(page, 0.1);
      expect((await state(page)).passes).toBe(0);
      await page.evaluate(() => (window.__mockPad.pressed = []));
      await advance(page, 0.1);
    }
    await page.evaluate((index) => (window.__mockPad.pressed = [index]), inboundButton);
    await expect.poll(async () => (await state(page)).passes).toBe(1);
    await advance(page, 0.4);
    expect((await state(page)).passes).toBe(1);
    await page.evaluate(() => (window.__mockPad.pressed = []));
  });
}

for (const legend of ['shaq', 'chuck'] as const) {
  test(`${legend}: the real right-stick input starts a stationary dribble and crosses without moving the body`, async ({
    page,
  }) => {
    await mockController(page);
    await bootGame(page);
    await page.bringToFront();
    await page.locator('canvas').click({ position: { x: 10, y: 10 } });
    await page.evaluate(async (legend) => {
      window.__TEST__!.setLegend!(0, legend);
      await window.__TEST__!.reset(42, 'live');
      window.__TEST__!.teleport('player', [5, 0.95, 0]);
      window.__TEST__!.teleport('opponent', [9, 0.95, -4]);
    }, legend);
    await advance(page);
    const before = (await state(page)).player as Point & { handling: string };
    expect(before.handling).toBe('hold');
    await selectVisibleHand(page, -1);
    await expect
      .poll(async () => ((await state(page)).player as { handling: string }).handling)
      .toBe('dribble');
    await expect
      .poll(async () => ((await state(page)).ballControl as { hand: number }).hand)
      .toBe(-1);
    await page.evaluate(() => {
      window.__mockPad.axes[2] = window.__mockPad.axes[3] = 0;
    });
    await advance(page, 0.8);
    expect(((await state(page)).ballControl as { hand: number }).hand).toBe(-1);
    await selectVisibleHand(page, 1);
    const frames = await page.evaluate(async () => {
      const frames: {
        time: number;
        ball: Point;
        phase: number;
        hand: number;
        crossing: boolean;
      }[] = [];
      const until = (window.__TEST__!.getState().time as number) + 1.5;
      while ((window.__TEST__!.getState().time as number) < until) {
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        const s = window.__TEST__!.getState();
        const c = s.ballControl as { phase: number; hand: number; crossing: boolean };
        frames.push({ time: s.time as number, ball: s.ball as Point, ...c });
      }
      return frames;
    });
    await page.evaluate(() => {
      window.__mockPad.axes[2] = window.__mockPad.axes[3] = 0;
    });
    expect(frames.some((f) => f.crossing)).toBe(true);
    expect(frames.at(-1)!.hand).toBe(1);
    for (let i = 1; i < frames.length; i++) {
      const dt = frames[i].time - frames[i - 1].time;
      expect(distance(frames[i].ball, frames[i - 1].ball)).toBeLessThan(10 * dt + 0.08);
      expect(frames[i].ball.y).toBeGreaterThanOrEqual(0.128);
    }
    const after = (await state(page)).player as Point;
    expect(Math.hypot(after.x - before.x, after.z - before.z)).toBeLessThan(0.05);
    expect((await state(page)).jabs).toBe(0);
  });
}

test('offense/defense controls learn keyboard, gamepad and mobile bindings, persist, and suppress the learning gesture', async ({
  page,
}, info) => {
  await mockController(page, false, [0, 0, -1, 0, 0, -1]);
  await bootGame(page);
  await page.bringToFront();
  await page.locator('canvas').click({ position: { x: 10, y: 10 } });
  await advance(page);
  await openControls(page);
  await page.getByRole('tab', { name: 'Keyboard', exact: true }).click();
  await page.locator('[data-control-action="HAND_LEFT"]').click();
  await page.keyboard.down('v');
  await expect
    .poll(async () => (await savedProfile(page))?.offense.keyboard.HAND_LEFT)
    .toEqual(['KeyV']);
  expect((await state(page)).screen).toBe('paused');
  await page.keyboard.up('v');
  await expect(page.locator('.controls-feedback[role="status"]')).toContainText(
    'Promena je sačuvana.',
  );

  await page.getByRole('tab', { name: 'Defense · odbrana' }).click();
  await page.locator('[data-control-action="ACTION_A"]').click();
  await page.keyboard.press('g');
  await expect
    .poll(async () => (await savedProfile(page))?.defense.keyboard.ACTION_A)
    .toEqual(['KeyG']);
  expect((await savedProfile(page))!.offense.keyboard.ACTION_A).toEqual(['KeyR', 'Space']);
  await page.getByRole('tab', { name: 'Offense · napad' }).click();
  await page.getByRole('tab', { name: 'Gamepad', exact: true }).click();
  await expect(page.getByText('SUITS test controller', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Kalibriši neutralni položaj', exact: true }).click();
  await expect
    .poll(async () => {
      const saved = (await savedProfile(page)) as ControlProfile & {
        padNeutral: Record<string, number[]>;
      };
      return saved.padNeutral[JSON.stringify(['SUITS test controller', '', 6])];
    })
    .toEqual([0, 0, -1, 0, 0, -1]);
  await expect(page.locator('[data-control-action="HAND_LEFT"]')).toHaveCount(0);
  await expect(page.locator('[data-control-action="HAND_RIGHT"]')).toHaveCount(0);
  await expect(page.locator('[data-control-action="SKILL_LEFT"]')).toContainText(
    'Desna palica levo',
  );
  await expect(page.locator('[data-control-action="SKILL_LEFT"]')).not.toContainText('kamera');
  await expect(page.locator('[data-control-action="INBOUND"]')).toContainText('✕ / A');
  await page.locator('[data-control-action="INBOUND"]').click();
  // Give the capture loop a neutral sample before pressing the learned button.
  await page.waitForTimeout(100);
  await page.evaluate(() => (window.__mockPad.pressed = [7]));
  await expect
    .poll(async () => (await savedProfile(page))?.offense.gamepad.INBOUND)
    .toEqual({
      kind: 'button',
      index: 7,
    });
  expect((await state(page)).screen).toBe('paused');
  await page.evaluate(() => (window.__mockPad.pressed = []));
  await expect(page.locator('.controls-feedback[role="status"]')).toContainText(
    'Promena je sačuvana.',
  );
  await page.locator('[data-control-action="SKILL_LEFT"]').click();
  await page.waitForTimeout(100);
  await page.evaluate(() => (window.__mockPad.pressed = [5]));
  await page.waitForTimeout(100);
  expect((await savedProfile(page))?.offense.gamepad.SKILL_LEFT).toEqual({
    kind: 'axis',
    index: 2,
    sign: -1,
  });
  await expect(page.locator('[data-control-action="SKILL_LEFT"]')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.evaluate(() => {
    window.__mockPad.pressed = [];
    window.__mockPad.axes[4] = -1;
  });
  await expect
    .poll(async () => (await savedProfile(page))?.offense.gamepad.SKILL_LEFT)
    .toEqual({ kind: 'axis', index: 4, sign: -1 });
  await page.evaluate(() => (window.__mockPad.axes[4] = 0));
  await expect(page.locator('.controls-feedback[role="status"]')).toContainText(
    'Promena je sačuvana.',
  );
  await page.locator('[data-control-action="SKILL_RIGHT"]').click();
  await page.waitForTimeout(100);
  await page.evaluate(() => (window.__mockPad.axes[4] = 1));
  await expect
    .poll(async () => (await savedProfile(page))?.offense.gamepad.SKILL_RIGHT)
    .toEqual({ kind: 'axis', index: 4, sign: 1 });
  await page.evaluate(() => (window.__mockPad.axes[4] = 0));
  await expect(page.locator('.controls-feedback[role="status"]')).toContainText(
    'Promena je sačuvana.',
  );
  await page.locator('[data-control-action="PAUSE"]').click();
  await page.waitForTimeout(100);
  await page.evaluate(() => (window.__mockPad.pressed = [8]));
  await expect
    .poll(async () => (await savedProfile(page))?.offense.gamepad.PAUSE)
    .toEqual({ kind: 'button', index: 8 });
  await page.waitForTimeout(120);
  expect((await state(page)).screen, 'the learned pause gesture must not resume the game').toBe(
    'paused',
  );
  await page.evaluate(() => (window.__mockPad.pressed = []));
  await expect(page.locator('.controls-feedback[role="status"]')).toContainText(
    'Promena je sačuvana.',
  );
  await page.screenshot({ path: info.outputPath('controls-desktop.png') });

  await page.getByRole('tab', { name: 'Mobile', exact: true }).click();
  await page.locator('[data-control-action="HAND_LEFT"]').click();
  await page.getByRole('button', { name: 'Dodeli square', exact: true }).click();
  await expect
    .poll(async () => (await savedProfile(page))?.offense.mobile.square)
    .toBe('HAND_LEFT');
  // The game is designed for landscape mobile play; inspect its compact settings layout.
  await page.setViewportSize({ width: 844, height: 390 });
  await page.screenshot({ path: info.outputPath('controls-mobile-landscape.png') });
  const saved = await savedProfile(page);
  await page.reload();
  await page.waitForFunction(() => window.__TEST__?.ready);
  expect(await savedProfile(page)).toEqual(saved);
  await page.evaluate(async () => {
    window.__TEST__!.setDebugFlag('testMode', true);
    await window.__TEST__!.reset(42, 'live');
  });
  await page.locator('canvas').click({ position: { x: 10, y: 10 } });
  await advance(page);
  await page.getByRole('button', { name: 'Square: Leva ruka · dribling / crossover' }).click();
  await expect
    .poll(async () => ((await state(page)).player as { handling: string }).handling)
    .toBe('dribble');
  expect(((await state(page)).player as { hand: number }).hand).toBe(1);
  await page.screenshot({ path: info.outputPath('remapped-touch-dribble.png') });
  await page.evaluate(() => window.__TEST__!.setHandling!(0, 'hold', 1));
  await advance(page);
  expect(((await state(page)).player as { handling: string }).handling).toBe('hold');
  await page.keyboard.press('v');
  await expect
    .poll(async () => ((await state(page)).player as { handling: string }).handling)
    .toBe('dribble');
  expect(((await state(page)).player as { hand: number }).hand).toBe(1);
  await selectVisibleHand(page, -1, 4, 3);
  await expect
    .poll(async () => ((await state(page)).ballControl as { hand: number }).hand)
    .toBe(-1);
  await page.evaluate(() => {
    window.__mockPad.axes[4] = window.__mockPad.axes[3] = 0;
  });
  // Ownership transfers at floor contact; the committed crossover continues until
  // the next top. Commands inside it are deliberately rejected, never replayed.
  await expect
    .poll(async () => ((await state(page)).ballControl as { crossing: boolean }).crossing)
    .toBe(false);
  await advance(page, 0.18);
  await selectVisibleHand(page, 1, 4, 3);
  await expect.poll(async () => ((await state(page)).ballControl as { hand: number }).hand).toBe(1);
  await page.evaluate(() => {
    window.__mockPad.axes[4] = window.__mockPad.axes[3] = 0;
  });
  await page.evaluate(() => (window.__mockPad.pressed = [8]));
  await expect.poll(async () => (await state(page)).screen).toBe('paused');
  await page.evaluate(() => (window.__mockPad.pressed = []));
  await page.waitForTimeout(100);
  await page.evaluate(() => (window.__mockPad.pressed = [8]));
  await expect.poll(async () => (await state(page)).screen).toBe('playing');
  await page.evaluate(() => (window.__mockPad.pressed = []));
});

test('pausing during a charged shot cancels the gesture instead of releasing a shot after resume', async ({
  page,
}) => {
  await bootGame(page);
  await page.bringToFront();
  await page.locator('canvas').click({ position: { x: 10, y: 10 } });
  await page.keyboard.down('r');
  try {
    await expect
      .poll(async () => ((await state(page)).player as { charge: number }).charge)
      .toBeGreaterThan(0.1);
    await page.keyboard.press('Escape');
    expect((await state(page)).screen).toBe('paused');
  } finally {
    await page.keyboard.up('r');
  }
  await page.keyboard.press('Escape');
  await expect.poll(async () => (await state(page)).screen).toBe('playing');
  await advance(page, 0.4);
  expect(((await state(page)).player as { charge: number }).charge).toBe(0);
  expect((await state(page)).shots).toBe(0);
});
