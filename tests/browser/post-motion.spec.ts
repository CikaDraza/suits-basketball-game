import { expect, test, type Page } from '@playwright/test';
import config from '../../src/game/data/game-config.json' with { type: 'json' };
import { createMovementTransform } from '../../src/game/simulation/coordinates';
import type { CharacterPoseSnapshot } from '../../src/game/harness/characterPose';
import { bootGame } from './helpers';

const movement = createMovementTransform(
  Math.atan2(
    config.camera.position[0] - config.camera.target[0],
    config.camera.position[2] - config.camera.target[2],
  ),
);
const state = (page: Page) => page.evaluate(() => window.__TEST__!.getState());
const pose = (page: Page) => page.evaluate(() => window.__TEST__!.getCharacterPose!(0)!);
let runtimeErrors: string[] = [];
test.beforeEach(({ page }) => {
  runtimeErrors = [];
  page.on('pageerror', (error) => runtimeErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') runtimeErrors.push(message.text());
  });
});
test.afterEach(() => expect(runtimeErrors).toEqual([]));
async function settle(page: Page, duration = 0.35) {
  const until = (await state(page)).time as number;
  await expect.poll(async () => (await state(page)).time).toBeGreaterThan(until + duration);
}

async function record(page: Page, duration: number) {
  return page.evaluate(async (duration) => {
    const samples: { pose: CharacterPoseSnapshot; x: number; z: number; angle: number }[] = [];
    const until = (window.__TEST__!.getState().time as number) + duration;
    // Software WebGL can render fewer than six frames in 0.7 s. Collect a full
    // minimum sample set as well as the requested simulated duration.
    while ((window.__TEST__!.getState().time as number) < until || samples.length < 8) {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const player = window.__TEST__!.getState().player as { x: number; z: number; angle: number };
      const pose = window.__TEST__!.getCharacterPose!(0);
      if (pose) samples.push({ pose, x: player.x, z: player.z, angle: player.angle });
    }
    return samples;
  }, duration);
}

function expectSteps(samples: Awaited<ReturnType<typeof record>>) {
  expect(samples.length).toBeGreaterThan(5);
  for (const sample of samples) {
    expect(sample.pose.leftSoleY).toBeGreaterThan(-0.012);
    expect(sample.pose.rightSoleY).toBeGreaterThan(-0.012);
    expect(Math.min(sample.pose.leftSoleY, sample.pose.rightSoleY)).toBeLessThan(0.025);
  }
  for (const side of ['Left', 'Right']) {
    const relative = samples.map((sample) => {
      const foot = sample.pose.joints[`${side}Foot`];
      return (
        (foot.x - sample.x) * Math.sin(sample.angle) + (foot.z - sample.z) * Math.cos(sample.angle)
      );
    });
    expect(Math.max(...relative) - Math.min(...relative)).toBeGreaterThan(0.1);
  }
  expect(
    Math.max(...samples.map((s) => Math.max(s.pose.leftSoleY, s.pose.rightSoleY))),
  ).toBeGreaterThan(0.03);
  let plantedContacts = 0;
  for (let i = 1; i < samples.length; i++) {
    const previous = samples[i - 1],
      current = samples[i];
    const bodyDistance = Math.hypot(current.x - previous.x, current.z - previous.z);
    if (bodyDistance < 0.015) continue;
    for (const side of ['Left', 'Right'] as const) {
      const a = previous.pose.joints[`${side}Foot`],
        b = current.pose.joints[`${side}Foot`];
      const sole = side === 'Left' ? 'leftSoleY' : 'rightSoleY';
      if (
        previous.pose[sole] < 0.015 &&
        current.pose[sole] < 0.015 &&
        Math.hypot(b.x - a.x, b.z - a.z) < bodyDistance * 0.65
      )
        plantedContacts++;
    }
  }
  expect(plantedContacts).toBeGreaterThan(0);
}

for (const legend of ['shaq', 'chuck'] as const) {
  test(`${legend}: inbound arms rest until Q, the contact/asking arms switch sides, and Q in the window passes immediately`, async ({
    page,
  }, info) => {
    await bootGame(page);
    await page.bringToFront();
    await page.locator('canvas').click({ position: { x: 10, y: 10 } });
    await page.evaluate(async (legend) => {
      window.__TEST__!.setLegend!(0, legend);
      await window.__TEST__!.reset(42, 'inbound');
      window.__TEST__!.teleport('player', [5, 0.95, 1.5]);
      window.__TEST__!.teleport('opponent', [5.9, 0.95, 1.5]);
    }, legend);
    await settle(page);
    const idle = await pose(page);
    expect(idle.joints.LeftHand.y).toBeLessThan(idle.joints.LeftArm.y - 0.3);
    expect(idle.joints.RightHand.y).toBeLessThan(idle.joints.RightArm.y - 0.3);
    await page.screenshot({ path: info.outputPath('idle-arms.png') });
    await page.keyboard.down('q');
    try {
      await expect
        .poll(async () => ((await state(page)).player as { mode: string }).mode)
        .toBe('post');
    } finally {
      await page.keyboard.up('q');
    }
    await settle(page);
    const leftContact = await pose(page);
    expect(leftContact.joints.RightHand.y - leftContact.joints.LeftHand.y).toBeGreaterThan(0.15);
    await page.screenshot({ path: info.outputPath('left-contact.png') });
    await page.evaluate(() => window.__TEST__!.teleport('opponent', [4.1, 0.95, 1.5]));
    await settle(page);
    const rightContact = await pose(page);
    expect(rightContact.joints.LeftHand.y - rightContact.joints.RightHand.y).toBeGreaterThan(0.15);
    await page.screenshot({ path: info.outputPath('right-contact.png') });
    await page.evaluate(
      (input) => window.__TEST__!.setInput({ moveX: input.x, moveZ: input.z }),
      movement.worldToStick(0, -1),
    );
    try {
      expectSteps(await record(page, 0.7));
      await page.screenshot({ path: info.outputPath('inbound-shuffle.png') });
    } finally {
      await page.evaluate(() => window.__TEST__!.setInput({ moveX: 0, moveZ: 0 }));
    }
    await expect.poll(async () => (await state(page)).inbound).toMatchObject({ stage: 'pass' });
    await page.keyboard.press('q');
    await expect.poll(async () => (await state(page)).passes).toBe(1);
  });

  test(`${legend}: post steps lift alternate feet while actually backing and pushing toward the hoop`, async ({
    page,
  }, info) => {
    await bootGame(page);
    await page.bringToFront();
    await page.locator('canvas').click({ position: { x: 10, y: 10 } });
    await page.evaluate(async (legend) => {
      window.__TEST__!.setLegend!(0, legend);
      await window.__TEST__!.reset(42);
      window.__TEST__!.teleport('player', [5, 0.95, 0]);
      window.__TEST__!.teleport('opponent', [3.95, 0.95, 0]);
    }, legend);
    await page.keyboard.down('q');
    try {
      await expect
        .poll(async () => ((await state(page)).player as { mode: string }).mode)
        .toBe('post');
    } finally {
      await page.keyboard.up('q');
    }
    await page.evaluate(
      (input) => window.__TEST__!.setInput({ moveX: input.x, moveZ: input.z }),
      movement.worldToStick(-1, 0),
    );
    try {
      await expect.poll(async () => (await state(page)).dribbles).toBeGreaterThan(0);
      const samples = await record(page, 1.3);
      expectSteps(samples);
      const first = samples[0],
        last = samples.at(-1)!;
      const dot =
        (last.x - first.x) * Math.sin(first.angle) + (last.z - first.z) * Math.cos(first.angle);
      expect(dot).toBeLessThan(-0.2);
      expect((await state(page)).bumps).toBeGreaterThan(0);
      await page.screenshot({ path: info.outputPath('backing-step.png') });
    } finally {
      await page.evaluate(() => window.__TEST__!.setInput({ moveX: 0, moveZ: 0 }));
    }
  });
}
