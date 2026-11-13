import { writeFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { bootGame } from './helpers';
import { config } from '../../src/game/data/gameConfig';

declare global {
  interface Window {
    __gameplayP2Buttons: number[];
  }
}

test.use({ viewport: { width: 1100, height: 650 } });
const debug = (page: Page, slot: 0 | 1 = 0) =>
  page.evaluate((slot) => window.__TEST__!.getGameplayDebug!(slot), slot);
const command = async (page: Page, action: string, slot: 0 | 1 = 0) =>
  (await debug(page, slot)).commands.find((row) => row.action === action);

test('keyboard walk and Q show independent request, decision, measured execution and live imported clips without an RS', async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('response', (response) => {
    if (response.status() >= 400) errors.push(response.url());
  });
  await page.goto('./?gameplayDebug');
  await page.waitForFunction(() => window.__TEST__?.ready && !!window.__TEST__.getGameplayDebug);
  await expect(page.getByRole('heading', { name: 'SUITS GAMEPLAY DEBUG' })).toBeVisible();
  await page.getByRole('button', { name: /Gameplay Debug/ }).click();
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await page.getByRole('button', { name: 'TRAINING', exact: true }).click();
  await page.getByRole('button', { name: /START TRAINING/ }).click();
  await page.waitForFunction(
    () =>
      window.__TEST__!.getEntities().length === 3 &&
      (window.__TEST__!.getState().time as number) > 0.2,
  );
  await page.bringToFront();
  await page.locator('canvas').click({ position: { x: 10, y: 10 } });
  await page.keyboard.down('d');
  try {
    await expect
      .poll(async () => (await command(page, 'move'))?.execution?.data.evidence)
      .toBe('measured-body-travel');
    await expect.poll(async () => !!(await command(page, 'move'))?.observation).toBe(true);
    await page.getByRole('button', { name: /Gameplay Debug/ }).click();
    await expect(page.getByTestId('gameplay-walk-clip')).toContainText('Retarget');
    await page.getByRole('heading', { name: 'BODY', exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: info.outputPath('walk-debug.png') });
  } finally {
    await writeFile(
      info.outputPath('movement-state.json'),
      JSON.stringify(
        await page.evaluate(() => ({
          state: window.__TEST__!.getState(),
          debug: window.__TEST__!.getGameplayDebug!(0),
        })),
        null,
        2,
      ),
    );
    await page.keyboard.up('d');
  }
  await page.keyboard.press('q');
  await expect
    .poll(async () => (await command(page, 'stance_or_special'))?.decision?.stage)
    .toBe('accepted');
  await expect
    .poll(async () => !!(await command(page, 'stance_or_special'))?.observation)
    .toBe(true);
  await expect(page.getByTestId('gameplay-defense-clip')).toContainText(
    'SHAQ_DEFENSE_SEQUENCE_V01',
  );
  await expect(page.getByTestId('gameplay-torso')).toContainText('imported-defense');
  const row = page.getByTestId('gameplay-command').filter({ hasText: 'stance_or_special' }).first();
  await row.locator('summary').first().click();
  await expect(row).toContainText('accepted');
  await expect(row).toContainText('Gameplay effect');
  await row.scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath('stance-command.png') });
  await page.getByRole('button', { name: 'RS DETAILS', exact: true }).click();
  await expect(page.getByText('Waiting for an input frame…')).toHaveCount(0);
  await page.getByRole('button', { name: 'GAMEPLAY', exact: true }).click();
  await page.setViewportSize({ width: 812, height: 375 });
  await page.getByRole('button', { name: 'Square: shoot / contest' }).hover();
  await page.mouse.down();
  try {
    await expect.poll(async () => !!(await command(page, 'contest'))?.execution).toBe(true);
  } finally {
    await page.mouse.up();
  }
  await expect.poll(async () => (await debug(page)).animation?.mode).toBe('idle');
  await page.screenshot({ path: info.outputPath('phone-debug.png') });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await writeFile(
    info.outputPath('gameplay-debug.json'),
    JSON.stringify(await debug(page), null, 2),
  );
  expect(errors).toEqual([]);
});

test('Duel tracks jab, dribble, shot charge/release, rejected inbound, P2 isolation and session reset', async ({
  page,
}, info) => {
  await page.addInitScript(() => {
    window.__gameplayP2Buttons = [];
    Object.defineProperty(navigator, 'getGamepads', {
      configurable: true,
      value: () =>
        [0, 1].map((index) => ({
          id: `Gameplay debug controller ${index}`,
          index,
          connected: true,
          mapping: 'standard',
          timestamp: performance.now(),
          axes: [0, 0, 0, 0],
          buttons: Array.from({ length: 16 }, (_, i) => ({
            pressed: index === 1 && window.__gameplayP2Buttons.includes(i),
            value: Number(index === 1 && window.__gameplayP2Buttons.includes(i)),
            touched: false,
          })),
        })),
    });
  });
  await bootGame(page);
  await page.evaluate(() => window.__TEST__!.teleport('opponent', [11, 0.95, -5]));
  await page.evaluate(() => {
    window.dispatchEvent(
      new KeyboardEvent('keydown', { code: 'ArrowUp', key: 'ArrowUp', bubbles: true }),
    );
    window.dispatchEvent(
      new KeyboardEvent('keyup', { code: 'ArrowUp', key: 'ArrowUp', bubbles: true }),
    );
  });
  await expect.poll(async () => !!(await command(page, 'jab'))?.execution).toBe(true);
  await page.keyboard.down('ArrowRight');
  try {
    await expect.poll(async () => !!(await command(page, 'dribble'))?.execution).toBe(true);
  } finally {
    await page.keyboard.up('ArrowRight');
  }
  await page.keyboard.down('Space');
  try {
    await expect.poll(async () => !!(await command(page, 'shoot_charge'))?.observation).toBe(true);
    await expect
      .poll(() =>
        page.evaluate(() => (window.__TEST__!.getState().player as { charge: number }).charge),
      )
      .toBeGreaterThan(config.shots.minHold + 0.1);
  } finally {
    await page.keyboard.up('Space');
  }
  await expect
    .poll(async () => (await command(page, 'shoot_release'))?.execution?.data.evidence)
    .toBe('shot-launched');
  await page.keyboard.press('e');
  await expect.poll(async () => (await command(page, 'inbound'))?.decision?.stage).toBe('rejected');
  const player = await debug(page);
  expect(player.commands.every((row) => row.slot === 0)).toBe(true);
  expect((await debug(page, 1)).commands.every((row) => row.slot === 1)).toBe(true);
  await page.evaluate(() => {
    window.__gameplayP2Buttons = [3];
  });
  try {
    await expect
      .poll(async () => (await command(page, 'stance_or_special', 1))?.execution?.data.mode)
      .toBe('post');
  } finally {
    await page.evaluate(() => {
      window.__gameplayP2Buttons = [];
    });
  }
  expect(
    (await debug(page, 0)).commands.some((row) => row.id === undefined || row.slot !== 0),
  ).toBe(false);
  await page.getByRole('button', { name: /Gameplay Debug/ }).click();
  await page.getByRole('combobox', { name: 'Player', exact: true }).selectOption('1');
  await expect(page.getByText('chuck / Duel', { exact: true })).toBeVisible();
  await writeFile(info.outputPath('duel-commands.json'), JSON.stringify(player.commands, null, 2));
  await page.evaluate(() => window.__TEST__!.reset(42, 'live'));
  expect((await debug(page)).commands.some((row) => row.action === 'shoot_release')).toBe(false);
});

test('keyboard inbound bypass path still correlates a queued request with a real launched pass', async ({
  page,
}) => {
  await bootGame(page);
  await page.evaluate(async () => {
    await window.__TEST__!.reset(42, 'inbound');
    window.__TEST__!.teleport('player', [5, 0.95, 1.5]);
    window.__TEST__!.teleport('opponent', [2, 0.95, -2]);
  });
  await expect
    .poll(
      () => page.evaluate(() => (window.__TEST__!.getState().inbound as { stage: string })?.stage),
      { timeout: 15000 },
    )
    .toBe('pass');
  await page.keyboard.press('e');
  await expect
    .poll(async () => (await command(page, 'inbound'))?.execution?.data.evidence)
    .toBe('inbound-launch');
  expect((await command(page, 'inbound'))?.decision?.stage).toBe('accepted');
});
