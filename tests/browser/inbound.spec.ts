import { expect, test, type Page } from '@playwright/test';
import { bootGame } from './helpers';
import type { PhysicalInboundPass } from '../../src/game/simulation/types';

test.setTimeout(60_000);
const snapshot = (page: Page) => page.evaluate(() => window.__TEST__!.getState());
const flight = (page: Page) =>
  page.evaluate(() => window.__TEST__!.getState().inboundPass as PhysicalInboundPass | null);

async function prepare(
  page: Page,
  receiver: [number, number, number],
  defender: [number, number, number],
  owner: 0 | 1 = 0,
) {
  await bootGame(page);
  await page.bringToFront();
  await page.locator('canvas').click({ position: { x: 10, y: 10 } });
  await page.evaluate(
    async ({ receiver, defender, owner }) => {
      await window.__TEST__!.reset(42, owner === 0 ? 'inbound' : 'inbound-cpu');
      window.__TEST__!.teleport(owner === 0 ? 'player' : 'opponent', receiver);
      window.__TEST__!.teleport(owner === 0 ? 'opponent' : 'player', defender);
    },
    { receiver, defender, owner },
  );
  await expect.poll(async () => (await snapshot(page)).inbound).toMatchObject({ stage: 'pass' });
}

async function request(page: Page, owner: 0 | 1 = 0) {
  await page.evaluate((slot) => window.__TEST__!.requestInboundPass!(slot), owner);
  await expect.poll(() => flight(page)).not.toBeNull();
}

test('inbound still waits 5+5, then violates to the same left sideline; early Q is not queued into the window', async ({
  page,
}) => {
  await bootGame(page);
  await page.bringToFront();
  await page.locator('canvas').click({ position: { x: 10, y: 10 } });
  await page.evaluate(() => window.__TEST__!.reset(42, 'inbound'));
  await page.keyboard.press('q');
  await expect.poll(async () => (await snapshot(page)).inbound).toMatchObject({ stage: 'pass' });
  expect((await snapshot(page)).passes).toBe(0);
  await expect.poll(async () => (await snapshot(page)).violations).toBe(1);
  const state = await snapshot(page);
  expect(state.inbound).toMatchObject({ stage: 'position', owner: 1 });
  expect(state.time).toBeGreaterThanOrEqual(10);
  const ball = state.ball as { x: number; y: number; z: number; state: string };
  expect(ball.state).toBe('inbound');
  expect(ball.x).toBeCloseTo(5.2, 5);
  expect(ball.y).toBeCloseTo(1, 5);
  expect(ball.z).toBeCloseTo(7.85, 5);
});

test('an open lane uses a physical chest pass aimed at current hands after the receiver changes position', async ({
  page,
}, info) => {
  await prepare(page, [5, 0.95, 1.5], [2, 0.95, -2]);
  // Move after the five-second positioning stage: the aim must not be a cached spawn/angle.
  await page.evaluate(() => window.__TEST__!.teleport('player', [7, 0.95, 1]));
  await page.keyboard.press('q');
  await expect.poll(() => flight(page)).not.toBeNull();
  const pass = (await flight(page))!;
  expect(pass.type).toBe('chest');
  expect(pass.risky).toBe(false);
  expect(pass.target.x).toBeGreaterThan(6);
  expect(pass.velocity.z).toBeLessThan(0);
  expect(pass.source).toEqual({ x: 5.2, y: 1, z: 7.85 });
  await expect.poll(async () => (await flight(page))?.outcome).toBe('caught');
  const state = await snapshot(page);
  // Catch is published after physics; the low-frequency HUD can still describe
  // the previous tick. Assert gameplay immediately and HUD convergence separately.
  expect(state.ball).toMatchObject({ owner: 0, state: 'held' });
  expect((state.player as { handling: string }).handling).toBe('hold');
  await expect.poll(async () => (await snapshot(page)).owner).toBe(0);
  await page.screenshot({ path: info.outputPath('chest-caught.png') });
});

test('fronting defense selects a high lob over the defender into a two-hand catch', async ({
  page,
}, info) => {
  await prepare(page, [5, 0.95, 1.5], [5, 0.95, 3.4]);
  await request(page);
  expect((await flight(page))!.type).toBe('lob');
  expect((await flight(page))!.risky).toBe(false);
  expect((await flight(page))!.apex).toBeGreaterThan(3.5);
  await page.screenshot({ path: info.outputPath('lob-flight.png') });
  await expect.poll(async () => (await flight(page))?.outcome).toBe('caught');
  await expect.poll(async () => (await snapshot(page)).owner).toBe(0);
});

test('a denied lob under the hoop contacts the actual backboard/rim and does not auto-dunk', async ({
  page,
}, info) => {
  await prepare(page, [1.6, 0.95, 0], [2.32, 0.95, 1.57]);
  await request(page);
  expect((await flight(page))!.risky).toBe(true);
  await expect.poll(async () => (await flight(page))?.outcome).toBe('deflected');
  expect(['backboard', 'rim']).toContain((await flight(page))!.contact);
  const state = await snapshot(page);
  expect(state.score).toBe(0);
  expect(state.cpuScore).toBe(0);
  expect(state.dunks).toBe(0);
  await page.screenshot({ path: info.outputPath('deep-lob-rebound.png') });
});

test('R intercepts an incoming CPU pass when the player crosses the actual path', async ({
  page,
}) => {
  await prepare(page, [5, 0.95, 1.5], [2, 0.95, -2], 1);
  await page.evaluate(() => {
    window.__TEST__!.requestInboundPass!(1);
    window.__TEST__!.teleport('player', [5.1, 0.95, 4]);
    window.__TEST__!.setInput({ actionA: true });
  });
  await expect.poll(async () => (await flight(page))?.outcome).toBe('intercepted');
  const state = await snapshot(page);
  expect(state.owner).toBe(0);
  expect(state.interceptions).toBe(1);
  await page.evaluate(() => window.__TEST__!.setInput({ actionA: false }));
});

test('a real basket and an out-of-bounds ball both restart from the same left sideline', async ({
  page,
}) => {
  await bootGame(page);
  await page.bringToFront();
  await page.locator('canvas').click({ position: { x: 10, y: 10 } });
  await page.evaluate(async () => {
    await window.__TEST__!.reset(42);
    window.__TEST__!.teleport('player', [1.6, 0.95, 0]);
    window.__TEST__!.teleport('opponent', [9, 0.95, 4]);
  });
  await page.keyboard.down('r');
  try {
    await expect
      .poll(async () => ((await snapshot(page)).player as { charge: number }).charge)
      .toBeGreaterThan(0.2);
  } finally {
    await page.keyboard.up('r');
  }
  await expect.poll(async () => (await snapshot(page)).score).toBe(1);
  await expect.poll(async () => (await snapshot(page)).inbound).toMatchObject({ owner: 1 });
  const checkSpot = async () => {
    const ball = (await snapshot(page)).ball as { x: number; y: number; z: number; state: string };
    expect(ball.state).toBe('inbound');
    expect(ball.x).toBeCloseTo(5.2, 5);
    expect(ball.y).toBeCloseTo(1, 5);
    expect(ball.z).toBeCloseTo(7.85, 5);
  };
  await checkSpot();
  await page.evaluate(async () => {
    await window.__TEST__!.reset(42);
    window.__TEST__!.teleport('ball', [15, 1, 0]);
  });
  await expect.poll(async () => (await snapshot(page)).inbound).toMatchObject({ owner: 1 });
  await checkSpot();
});

test('the autonomous CPU requests its inbound and meets the physical receiving point', async ({
  page,
}) => {
  await prepare(page, [5, 0.95, 1.5], [2, 0.95, -2], 1);
  await page.evaluate(() => window.__TEST__!.setDebugFlag('testMode', false));
  await expect.poll(() => flight(page)).not.toBeNull();
  expect((await flight(page))!.receiver).toBe(1);
  await expect.poll(async () => (await flight(page))?.outcome).toBe('caught');
  await expect.poll(async () => (await snapshot(page)).owner).toBe(1);
});
