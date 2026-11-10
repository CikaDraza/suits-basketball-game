import { expect, test, type Page } from '@playwright/test';
import { config, level } from '../../src/game/data/gameConfig';
import { createDefaultProfile } from '../../src/game/input/controlBindings';
import { createMovementTransform } from '../../src/game/simulation/coordinates';
import type { Fighter } from '../../src/game/simulation/types';

test.use({ viewport: { width: 960, height: 540 } });
declare global {
  interface Window {
    __trainingAxes: number[];
    __trainingButtons: number[];
  }
}
const state = (page: Page) => page.evaluate(() => window.__TEST__!.getState());
const player = async (page: Page) => (await state(page)).player as Fighter;
const frames = (page: Page, n = 2) =>
  page.evaluate(async (n) => {
    for (let i = 0; i < n; i++) await new Promise<void>((r) => requestAnimationFrame(() => r()));
  }, n);
async function boot(page: Page) {
  await page.goto('./');
  await page.waitForFunction(
    () => window.__TEST__?.ready && window.__TEST__.getEntities().length === 5,
  );
  // Deliberately leave the global testMode disabled: CPU and physics use production rules.
  await expect(page.locator('canvas')).toBeVisible();
}
async function enterTraining(page: Page) {
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await page.getByRole('button', { name: 'TRAINING', exact: true }).click();
  await expect(page.getByRole('button', { name: /SOLO PRACTICE/ })).toBeDisabled();
  await expect(page.getByRole('button', { name: /1v1 PRACTICE/ })).toBeDisabled();
  await page.getByRole('button', { name: /FREE MOVEMENT/ }).click();
  await page.getByRole('button', { name: /START TRAINING/ }).click();
  await expect
    .poll(() => state(page))
    .toMatchObject({
      session: { kind: 'training', drill: 'movement' },
      activeBodies: { players: [true, false], ball: false },
      renderedCharacters: [0],
      ballState: 'inactive',
      owner: -1,
      cpu: false,
      inbound: null,
    });
}
async function installPad(page: Page) {
  await page.addInitScript(() => {
    window.__trainingAxes = [0, 0, 0, 0];
    window.__trainingButtons = [];
    Object.defineProperty(navigator, 'getGamepads', {
      configurable: true,
      value: () => [
        {
          id: 'Training controller',
          index: 0,
          connected: true,
          mapping: 'standard',
          timestamp: performance.now(),
          axes: [...window.__trainingAxes],
          buttons: Array.from({ length: 16 }, (_, i) => ({
            pressed: window.__trainingButtons.includes(i),
            touched: false,
            value: Number(window.__trainingButtons.includes(i)),
          })),
        },
      ],
    });
  });
}
async function neutral(page: Page) {
  await page.evaluate(() => {
    window.__trainingAxes = [0, 0, 0, 0];
  });
  await frames(page);
  await expect.poll(async () => (await player(page)).defenseHands).toBe('none');
}
async function direction(page: Page, hands: 'left' | 'right' | 'up' | 'brace') {
  await page.evaluate((hands) => {
    const d = window.__TEST__!.getRightStickDebug!(0)!;
    const { x, z } = d.screenForward;
    const side = hands === 'left' || hands === 'right';
    const sign = hands === 'right' || hands === 'brace' ? -1 : 1;
    // Physical axes, using the rendered heading observed by existing diagnostics.
    window.__trainingAxes[2] = sign * (side ? -z : x);
    window.__trainingAxes[3] = -sign * (side ? x : z);
  }, hands);
  await expect.poll(async () => (await player(page)).defenseHands).toBe(hands);
}

test('production flow: keyboard/touch movement, pause/resume, restart, preferences, and New Duel', async ({
  page,
}, info) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('response', (r) => {
    if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`);
  });
  await page.addInitScript((profile) => {
    // A saved defense-only binding proves the active context is defense without a ball.
    profile.defense.keyboard.MOVE_RIGHT = ['KeyL'];
    localStorage.setItem('suits.controls.v1', JSON.stringify(profile));
  }, createDefaultProfile());
  await boot(page);
  const saved = await page.evaluate(() => localStorage.getItem('suits.controls.v1'));
  await enterTraining(page);
  const from = await player(page);
  await page.keyboard.down('l');
  await expect
    .poll(async () => {
      const p = await player(page);
      return Math.hypot(p.x - from.x, p.z - from.z);
    })
    .toBeGreaterThan(0.5);
  await page.keyboard.up('l');
  await expect
    .poll(async () => Math.hypot((await player(page)).moveVX, (await player(page)).moveVZ))
    .toBeLessThan(0.02);
  await page.keyboard.press('q');
  await expect.poll(async () => (await player(page)).mode).toBe('post');
  await page.keyboard.down('Space');
  await expect.poll(async () => (await player(page)).mode).toBe('contest');
  await page.keyboard.up('Space');
  await expect.poll(async () => (await player(page)).mode).toBe('idle');
  // Real touch joystick, with the same bridge used by Duel.
  const joy = (await page.getByLabel('Movement joystick').boundingBox())!;
  const client = await page.context().newCDPSession(page);
  const touch = { x: joy.x + joy.width / 2, y: joy.y + joy.height / 2, id: 1 };
  const beforeTouch = await player(page);
  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [touch] });
  await client.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [{ ...touch, x: touch.x + joy.width * 0.3 }],
  });
  await expect
    .poll(async () => {
      const p = await player(page);
      return Math.hypot(p.x - beforeTouch.x, p.z - beforeTouch.z);
    })
    .toBeGreaterThan(0.4);
  await client.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  await client.detach();
  await expect.poll(async () => (await state(page)).input).toMatchObject({ moveX: 0, moveZ: 0 });
  await expect
    .poll(async () => Math.hypot((await player(page)).moveVX, (await player(page)).moveVZ))
    .toBeLessThan(0.02);
  await page.keyboard.press('Escape');
  const paused = await player(page);
  const revision = (await state(page)).revision;
  await page.waitForTimeout(250);
  expect((await player(page)).x).toBe(paused.x);
  await page.getByRole('button', { name: /BACK TO BUSINESS/ }).click();
  await frames(page, 3);
  const resumed = await player(page);
  expect(Math.hypot(resumed.x - paused.x, resumed.z - paused.z)).toBeLessThan(0.02);
  expect((await state(page)).revision).toBe(revision);
  await page.screenshot({ path: info.outputPath('free-movement-shaq.png') });
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'RESTART TRAINING', exact: true }).click();
  await expect.poll(async () => (await state(page)).revision).toBe(Number(revision) + 1);
  await expect.poll(async () => (await player(page)).x).toBeCloseTo(level.spawns[0].x, 2);
  await page.keyboard.press('Escape');
  const p1 = page.locator('.matchup section').first();
  await p1.getByRole('button', { name: /CHUCK/ }).click();
  await expect
    .poll(() => state(page))
    .toMatchObject({ screen: 'paused', legends: ['chuck', 'chuck'] });
  await page.getByRole('button', { name: /BACK TO BUSINESS/ }).click();
  await expect.poll(async () => (await player(page)).legend).toBe('chuck');
  expect((await state(page)).renderedCharacters).toEqual([0]);
  await page.screenshot({ path: info.outputPath('free-movement-chuck.png') });
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'TRAINING', exact: true }).click();
  await page.screenshot({ path: info.outputPath('training-menu.png') });
  await page.getByRole('button', { name: '← BACK', exact: true }).click();
  await page.getByRole('button', { name: 'NEW DUEL', exact: true }).click();
  await expect
    .poll(() => state(page))
    .toMatchObject({
      session: { kind: 'duel' },
      activeBodies: { players: [true, true], ball: true },
      renderedCharacters: [0, 1],
      ballState: 'inbound',
      cpu: true,
    });
  await expect
    .poll(async () => ((await state(page)).opponent as Fighter).aiClock)
    .toBeGreaterThan(0);
  await page.screenshot({ path: info.outputPath('new-duel.png') });
  expect(await page.evaluate(() => localStorage.getItem('suits.controls.v1'))).toBe(saved);
  expect(errors).toEqual([]);
});

for (const legend of ['shaq', 'chuck'] as const) {
  test(`${legend}: eight natural facings, defensive directions/rearm, double flicks without a contact target`, async ({
    page,
  }, info) => {
    test.setTimeout(180_000);
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await installPad(page);
    await boot(page);
    if (legend === 'chuck') {
      await page.getByRole('button', { name: 'Pause', exact: true }).click();
      await page.locator('.matchup section').first().getByRole('button', { name: /CHUCK/ }).click();
      await page.getByRole('button', { name: /BACK TO BUSINESS/ }).click();
    }
    await enterTraining(page);
    const transform = createMovementTransform(config.camera.inputAngle);
    for (let n = 0; n < 8; n++) {
      const angle = (n * Math.PI) / 4;
      const stick = transform.worldToStick(Math.sin(angle), Math.cos(angle));
      await neutral(page);
      await page.evaluate(
        ({ x, z, deadzone }) => {
          const axis = (v: number) =>
            v === 0 ? 0 : Math.sign(v) * (Math.abs(v) * (1 - deadzone) + deadzone);
          window.__trainingAxes = [axis(x), -axis(z), 0, 0];
        },
        { ...stick, deadzone: createDefaultProfile().deadzone },
      );
      await expect
        .poll(async () => {
          const p = await player(page);
          return Math.abs(Math.atan2(Math.sin(p.angle - angle), Math.cos(p.angle - angle)));
        })
        .toBeLessThan(0.03);
      await neutral(page);
      await expect
        .poll(async () => Math.hypot((await player(page)).moveVX, (await player(page)).moveVZ))
        .toBeLessThan(0.02);
      for (const hands of ['left', 'right', 'up', 'brace'] as const) {
        await neutral(page);
        await direction(page, hands);
        const d = await page.evaluate(() => window.__TEST__!.getRightStickDebug!(0));
        expect(d?.context).toBe('defense');
        expect(d?.selected).toBe(hands);
        const pose = await page.evaluate(() => window.__TEST__!.getCharacterPose!(0));
        expect(pose).not.toBeNull();
        for (const point of Object.values(pose!.joints))
          for (const value of Object.values(point)) expect(Number.isFinite(value)).toBe(true);
      }
    }
    await neutral(page);
    // Double flicks are generated inside one browser task to keep their real timing window.
    const doubles = await page.evaluate(async () => {
      const seam = window.__TEST__!;
      const frame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));
      const out: string[] = [];
      for (const sign of [1, -1]) {
        window.__trainingAxes = [0, 0, 0, 0];
        await new Promise((r) => setTimeout(r, 400));
        for (let flick = 0; flick < 2; flick++) {
          const d = seam.getRightStickDebug!(0)!;
          window.__trainingAxes = [0, 0, sign * d.screenForward.x, -sign * d.screenForward.z];
          await frame();
          await frame();
          if (flick === 0) {
            window.__trainingAxes = [0, 0, 0, 0];
            await frame();
            await frame();
          }
        }
        // Gesture sampling precedes fixed physics. Wait for the pending shove to
        // reach that step instead of treating a render callback as a physics tick.
        if (sign === -1) {
          for (let i = 0; i < 30 && (seam.getState().player as Fighter).defensePushAt < 0; i++)
            await frame();
        }
        const p = seam.getState().player as Fighter;
        out.push(sign === 1 ? p.defenseHands : p.defensePushAt >= 0 ? 'push' : 'missing');
      }
      return out;
    });
    expect(doubles).toEqual(['wave', 'push']);
    await page.waitForTimeout(500);
    expect((await state(page)).defensePushes).toBe(0);
    expect(((await state(page)).opponent as Fighter).aiClock).toBe(0);
    expect((await state(page)).bumps).toBe(0);
    await neutral(page);
    await direction(page, 'left');
    await page.waitForTimeout(400);
    await page.screenshot({ path: info.outputPath(`${legend}-defensive-left.png`) });
    // A held physical stick cannot leak a gesture through restart; neutral rearms it.
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'RESTART TRAINING', exact: true }).click();
    await expect.poll(async () => (await player(page)).defenseHands).toBe('none');
    await frames(page, 4);
    expect((await player(page)).defensePushAt).toBe(-10);
    await neutral(page);
    await direction(page, 'brace');
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'NEW DUEL', exact: true }).click();
    await expect
      .poll(() => state(page))
      .toMatchObject({
        session: { kind: 'duel' },
        activeBodies: { players: [true, true], ball: true },
        player: { defensePushAt: -10, defenseHands: 'none' },
      });
    expect(errors).toEqual([]);
  });
}
