import { expect, test, type Page } from '@playwright/test';
import type { GameInputEvent } from '../../src/components/touch-overlay/types';
import { bootGame } from './helpers';

type InputSnapshot = {
  moveX: number;
  moveZ: number;
  actionA: boolean;
  actionB: boolean;
};

const readInput = (page: Page) =>
  page.evaluate(() => window.__TEST__!.getState().input as InputSnapshot);
const readScreen = (page: Page) => page.evaluate(() => window.__TEST__!.getState().screen);
const emit = (page: Page, detail: GameInputEvent) =>
  page.evaluate((event) => {
    window.dispatchEvent(new CustomEvent('game:input', { detail: event }));
  }, detail);

async function expectInput(page: Page, expected: Partial<InputSnapshot>) {
  await expect.poll(() => readInput(page)).toMatchObject(expected);
}

test.beforeEach(async ({ page }) => {
  await bootGame(page);
  await expect.poll(() => readScreen(page)).toBe('playing');
  await page.bringToFront();
  await page.locator('canvas').click({ position: { x: 10, y: 10 } });
  // Isolate input ownership from AI/physics; the real controls and DOM stay mounted.
  await page.evaluate(() => {
    window.__PAUSED__ = true;
  });
});

test('Escape pauses and resumes once per physical press, including focused menu buttons', async ({
  page,
}) => {
  await page.keyboard.down('Escape');
  await expect.poll(() => readScreen(page)).toBe('paused');
  await page.keyboard.down('Escape');
  await expect.poll(() => readScreen(page)).toBe('paused');
  await page.keyboard.up('Escape');
  await page.getByRole('button', { name: 'BACK TO BUSINESS' }).focus();
  await page.keyboard.press('Escape');
  await expect.poll(() => readScreen(page)).toBe('playing');
  await page.keyboard.press('Escape');
  await expect.poll(() => readScreen(page)).toBe('paused');
});

test('keyboard aliases stay pressed until the last mapped key is released', async ({ page }) => {
  await page.keyboard.down('ArrowUp');
  await page.keyboard.down('w');
  await expectInput(page, { moveZ: 1 });
  await page.keyboard.up('ArrowUp');
  await expectInput(page, { moveZ: 1 });
  await page.keyboard.up('w');
  await expectInput(page, { moveZ: 0 });

  await page.keyboard.down('r');
  await page.keyboard.down('Space');
  await page.keyboard.up('r');
  await expectInput(page, { actionA: true });
  await page.keyboard.up('Space');
  await expectInput(page, { actionA: false });
});

test('pause and blur clear held input and subsequent movement starts cleanly', async ({ page }) => {
  await page.keyboard.down('ArrowRight');
  await expectInput(page, { moveX: 1 });
  await page.keyboard.press('Escape');
  await expectInput(page, { moveX: 0, moveZ: 0, actionA: false, actionB: false });
  await page.keyboard.up('ArrowRight');
  await page.keyboard.press('Escape');
  await expect.poll(() => readScreen(page)).toBe('playing');
  await expectInput(page, { moveX: 0 });

  await page.keyboard.down('ArrowLeft');
  await page.keyboard.down('r');
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await expectInput(page, { moveX: 0, actionA: false });
  await page.keyboard.up('ArrowLeft');
  await page.keyboard.up('r');
  await page.keyboard.down('ArrowRight');
  await expectInput(page, { moveX: 1 });
  await page.keyboard.up('ArrowRight');
});

test('keyboard and joystick movement merge without doubling the joystick digital events', async ({
  page,
}) => {
  await emit(page, {
    action: 'MOVE',
    phase: 'change',
    axis: { x: 0.4, y: -0.25 },
    source: 'touch',
  });
  await emit(page, { action: 'MOVE_RIGHT', phase: 'down', source: 'touch' });
  await expectInput(page, { moveX: 0.4, moveZ: 0.25 });
  await page.keyboard.down('ArrowUp');
  await expectInput(page, { moveX: 0.4, moveZ: 1 });
  await page.keyboard.up('ArrowUp');
  await expectInput(page, { moveX: 0.4, moveZ: 0.25 });
  await emit(page, { action: 'MOVE', phase: 'change', axis: { x: 0, y: 0 }, source: 'touch' });
  await emit(page, { action: 'MOVE_RIGHT', phase: 'up', source: 'touch' });
  await expectInput(page, { moveX: 0, moveZ: 0 });
});

test('releasing one action source preserves the other held source', async ({ page }) => {
  for (const [key, action, field] of [
    ['r', 'ACTION_A', 'actionA'],
    ['q', 'ACTION_B', 'actionB'],
  ] as const) {
    await page.keyboard.down(key);
    await emit(page, { action, phase: 'down', source: 'touch' });
    await emit(page, { action, phase: 'up', source: 'touch' });
    await expectInput(page, { [field]: true });
    await page.keyboard.up(key);
    await expectInput(page, { [field]: false });

    await emit(page, { action, phase: 'down', source: 'touch' });
    await page.keyboard.down(key);
    await page.keyboard.up(key);
    await expectInput(page, { [field]: true });
    await emit(page, { action, phase: 'up', source: 'touch' });
    await expectInput(page, { [field]: false });
  }
});

test('a second touch can release an action without moving or releasing the joystick', async ({
  page,
}) => {
  const joystick = await page.getByLabel('Movement joystick').boundingBox();
  const shoot = await page.getByRole('button', { name: 'Square: shoot / contest' }).boundingBox();
  expect(joystick).not.toBeNull();
  expect(shoot).not.toBeNull();
  const center = {
    x: joystick!.x + joystick!.width / 2,
    y: joystick!.y + joystick!.height / 2,
    id: 1,
  };
  const moved = { ...center, x: center.x + joystick!.width * 0.2 };
  const button = { x: shoot!.x + shoot!.width / 2, y: shoot!.y + shoot!.height / 2, id: 2 };
  const client = await page.context().newCDPSession(page);
  try {
    await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [center] });
    await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [moved] });
    await expect.poll(async () => (await readInput(page)).moveX).toBeGreaterThan(0.4);
    const axis = (await readInput(page)).moveX;
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [moved, button],
    });
    await expectInput(page, { actionA: true, moveX: axis });
    await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [button] });
    await expectInput(page, { actionA: false, moveX: axis });
    await client.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
    await expectInput(page, { moveX: 0, moveZ: 0 });

    await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [button] });
    await expectInput(page, { actionA: true });
    await client.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
    await expectInput(page, { actionA: false });
  } finally {
    await client.detach();
  }
});
