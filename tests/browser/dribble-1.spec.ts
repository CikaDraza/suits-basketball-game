import { writeFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { createDefaultProfile } from '../../src/game/input/controlBindings';
import { config, level, type Legend } from '../../src/game/data/gameConfig';
import { createMovementTransform } from '../../src/game/simulation/coordinates';
import type { CharacterPoseSnapshot } from '../../src/game/harness/characterPose';
import { bootGame } from './helpers';

type Point = { x: number; y: number; z: number };
type Stick = { x: number; z: number };
type Hand = 1 | -1;
type Skill = {
  activations: number;
  rejected: number;
  pending: number;
  last: { hand: Hand; facing: number; sequence: number } | null;
};
type Handling = {
  phase: number;
  hand: Hand;
  crossing: boolean;
  local: Point;
  postBlend: number;
  shape: { hipSide: number; dribbleForward: number; dribbleTop: number } | null;
  skill: { kind: 'side' | 'front' | 'behind'; started: boolean; total: number } | null;
  lastSkill: { kind: 'side' | 'front' | 'behind'; initialHand: Hand; total: number } | null;
};
type Snapshot = {
  time: number;
  screen: string;
  player: Point & { angle: number; hand: Hand; mode: string; handling: string };
  opponent: Point;
  ball: Point & { rendered: Point; owner: number };
  ballControl: Handling;
  skillInput: Skill[];
  jabs: number;
};
type Frame = {
  time: number;
  renderTime: number;
  player: Snapshot['player'];
  ball: Point;
  physicsBall: Point;
  control: Handling;
  skill: Skill;
  hands: CharacterPoseSnapshot['hands'];
  pose: CharacterPoseSnapshot | null;
  gait: { moving: boolean; feet: { planted: boolean }[] } | null;
};
declare global {
  interface Window {
    __d1Pad: { axes: number[]; connected: boolean };
  }
}
const movement = createMovementTransform(config.camera.inputAngle);
const state = (page: Page) =>
  page.evaluate(() => window.__TEST__!.getState() as unknown as Snapshot);
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const angleDifference = (a: number, b: number) =>
  Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));

async function addController(page: Page) {
  await page.addInitScript((defaults) => {
    window.__d1Pad = { axes: [0, 0, 0, 0, -1, -1], connected: true };
    defaults.padNeutral[JSON.stringify(['DRIBBLE-1 browser controller', '', 6])] = [
      0, 0, 0, 0, -1, -1,
    ];
    localStorage.setItem('suits.controls.v1', JSON.stringify(defaults));
    Object.defineProperty(navigator, 'getGamepads', {
      configurable: true,
      value: () => [
        null,
        null,
        {
          id: 'DRIBBLE-1 browser controller',
          index: 2,
          mapping: '',
          connected: window.__d1Pad.connected,
          timestamp: performance.now(),
          axes: [...window.__d1Pad.axes],
          buttons: Array.from({ length: 16 }, () => ({ pressed: false, touched: false, value: 0 })),
        },
      ],
    });
  }, createDefaultProfile());
}
async function advance(page: Page, seconds: number) {
  const from = (await state(page)).time;
  await expect.poll(async () => (await state(page)).time).toBeGreaterThan(from + seconds);
}
async function stick(page: Page, vector: Stick) {
  await page.evaluate(({ x, z }) => {
    window.__d1Pad.axes[2] = x;
    window.__d1Pad.axes[3] = -z;
  }, vector);
}
async function neutral(page: Page) {
  await stick(page, { x: 0, z: 0 });
  await advance(page, 0.18);
}
async function prepare(page: Page, legend: Legend, hand: Hand = 1) {
  await addController(page);
  await bootGame(page);
  await page.bringToFront();
  await page.locator('canvas').click({ position: { x: 10, y: 10 } });
  await page.evaluate(
    async ({ legend, hand }) => {
      window.__TEST__!.setLegend!(0, legend);
      await window.__TEST__!.reset(42, 'live');
      window.__TEST__!.teleport('player', [6, 0.95, 0]);
      window.__TEST__!.teleport('opponent', [11, 0.95, -5]);
      window.__TEST__!.setHandling!(0, 'dribble', hand);
    },
    { legend, hand },
  );
  await advance(page, 1.3);
}
/** Screen-space side is perpendicular to the independently projected body-forward. */
async function visibleSide(page: Page, hand: Hand): Promise<Stick> {
  return page.evaluate((hand) => {
    const s = window.__TEST__!.getState();
    const p = s.player as { x: number; z: number; angle: number };
    const center = window.__TEST__!.project!([p.x, 1.3, p.z]);
    const side = window.__TEST__!.project!([p.x + Math.sin(p.angle), 1.3, p.z + Math.cos(p.angle)]);
    const x = side.x - center.x,
      z = center.y - side.y;
    const length = Math.hypot(x, z);
    if (length < 1e-6) throw new Error('Anatomical side is not visible in this camera');
    return { x: (-hand * z) / length, z: (hand * x) / length };
  }, hand);
}
async function record(page: Page, seconds: number, fullPose = false): Promise<Frame[]> {
  return page.evaluate(
    async ({ seconds, fullPose }) => {
      const frames: Frame[] = [];
      const until = (window.__TEST__!.getState().time as number) + seconds;
      while ((window.__TEST__!.getState().time as number) < until || frames.length < 6) {
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        const s = window.__TEST__!.getState() as unknown as Snapshot;
        frames.push({
          time: s.time,
          renderTime: performance.now() / 1000,
          player: s.player,
          ball: s.ball.rendered,
          physicsBall: { x: s.ball.x, y: s.ball.y, z: s.ball.z },
          control: s.ballControl,
          skill: s.skillInput[0],
          hands: window.__TEST__!.getHandContacts!(0),
          pose: fullPose ? window.__TEST__!.getCharacterPose!(0) : null,
          gait: window.__TEST__!.getLocomotion!(0),
        });
      }
      return frames;
    },
    { seconds, fullPose },
  );
}
function checkPath(frames: Frame[], label: string) {
  for (let i = 0; i < frames.length; i++) {
    const frame = frames[i];
    expect(frame.ball.y, `${label}: ball below court`).toBeGreaterThanOrEqual(0.128);
    const active = frame.hands[frame.control.hand === 1 ? 0 : 1];
    expect(active.wristBend, `${label}: wrist`).toBeLessThan(65.02);
    if (active.weight > 0.98)
      expect(active.error, `${label}: unreachable palm`).toBeLessThan(0.025);
    if (i === 0) continue;
    const previous = frames[i - 1],
      dt = frame.time - previous.time;
    const bodyMotion =
      Math.hypot(frame.player.x - previous.player.x, frame.player.z - previous.player.z) +
      Math.max(
        Math.hypot(frame.control.local.x, frame.control.local.z),
        Math.hypot(previous.control.local.x, previous.control.local.z),
      ) *
        angleDifference(frame.player.angle, previous.player.angle);
    const shape = frame.control.shape!;
    const { skills } = config.ballControl;
    const fastestPeriod = Math.min(skills.period, config.ballControl.period);
    const maxBallSpeed = Math.hypot(
      (3 * shape.hipSide + 2 * Math.PI * skills.sideReach) / fastestPeriod,
      (4 * (shape.dribbleTop - config.ball.radius)) / fastestPeriod,
      (Math.PI *
        Math.max(
          config.ballControl.crossoverForward,
          Math.abs(skills.behindForward - shape.dribbleForward),
        )) /
        fastestPeriod,
    );
    // Rapier interpolates the rendered mesh even on frames without a physics tick.
    // Compare each position with its own clock, rather than treating dt=0 as a teleport.
    expect(
      distance(frame.physicsBall, previous.physicsBall),
      `${label}: physics ball jump`,
    ).toBeLessThan(maxBallSpeed * dt + bodyMotion + 0.08);
    expect(distance(frame.ball, previous.ball), `${label}: rendered ball jump`).toBeLessThan(
      maxBallSpeed * (frame.renderTime - previous.renderTime) + bodyMotion + 0.08,
    );
    const skillDuringInterval =
      previous.control.skill ||
      frame.control.skill ||
      JSON.stringify(previous.control.lastSkill) !== JSON.stringify(frame.control.lastSkill);
    const bothRapid = previous.control.skill?.started && frame.control.skill?.started;
    const minimumProgress = dt / (bothRapid ? fastestPeriod : config.ballControl.period);
    const maximumProgress = dt / (skillDuringInterval ? fastestPeriod : config.ballControl.period);
    const progress = (frame.control.phase - previous.control.phase + 1) % 1;
    // Entry and completion can change the bounce speed inside this interval.
    // Some whole number of cycles must still fit between the two valid rates.
    expect(
      Math.ceil(minimumProgress - progress - 1e-6),
      `${label}: bounce phase jumps outside the normal/rapid clock rates`,
    ).toBeLessThanOrEqual(Math.floor(maximumProgress - progress + 1e-6));
  }
}
function checkContacts(frames: Frame[], label: string) {
  let contacts = 0;
  for (const frame of frames) {
    if (!(frame.control.phase < 0.07 || frame.control.phase > 0.93)) continue;
    const active = frame.hands[frame.control.hand === 1 ? 0 : 1];
    if (active.weight < 0.98) continue;
    contacts++;
    expect(
      Math.abs(distance(active.palm, frame.ball) - config.ball.radius),
      `${label}: palm gap`,
    ).toBeLessThan(0.025);
    const dx = frame.ball.x - active.palm.x,
      dy = frame.ball.y - active.palm.y,
      dz = frame.ball.z - active.palm.z;
    expect(
      (dx * active.normal.x + dy * active.normal.y + dz * active.normal.z) / Math.hypot(dx, dy, dz),
      `${label}: palm facing`,
    ).toBeGreaterThan(0.9);
  }
  return contacts;
}
async function requestHand(page: Page, hand: Hand) {
  // An ordinary request starts after the previous committed transfer finishes.
  // Rejection during a live crossover is covered by the pure input-policy tests.
  await expect.poll(async () => (await state(page)).ballControl.crossing).toBe(false);
  await neutral(page);
  const activations = (await state(page)).skillInput[0].activations;
  await stick(page, await visibleSide(page, hand));
  await expect
    .poll(async () => (await state(page)).skillInput[0].activations)
    .toBeGreaterThan(activations);
  await expect.poll(async () => (await state(page)).player.hand).toBe(hand);
}
async function post(page: Page, enabled: boolean) {
  await page.keyboard.down('q');
  try {
    await expect.poll(async () => (await state(page)).player.mode).toBe(enabled ? 'post' : 'idle');
  } finally {
    await page.keyboard.up('q');
  }
}

test.setTimeout(150_000);
for (const legend of ['shaq', 'chuck'] as const) {
  test(`${legend}: SC-D1/D2 — eight facings interpret the visible hand once without translating or turning the body`, async ({
    page,
  }, info) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await prepare(page, legend);
    const facing = (x: number, z: number) => {
      const w = movement.stickToWorld(x, z);
      return Math.atan2(w.x, w.z);
    };
    const orientations = [
      ['screen-left', facing(-1, 0)],
      ['screen-right', facing(1, 0)],
      ['toward-basket', -Math.PI / 2],
      ['away-from-basket', Math.PI / 2],
      ['up-left', facing(-1, 1)],
      ['up-right', facing(1, 1)],
      ['down-left', facing(-1, -1)],
      ['down-right', facing(1, -1)],
    ] as const;
    const measurements: Record<string, unknown>[] = [];
    try {
      for (const [label, angle] of orientations) {
        await neutral(page);
        await page.evaluate((angle) => window.__TEST__!.setFacing!(0, angle), angle);
        await advance(page, 0.45);
        const before = await state(page);
        await stick(page, { x: 0.1, z: -0.1 });
        await advance(page, 0.22);
        expect((await state(page)).skillInput[0].activations, `${label}: below deadzone`).toBe(
          before.skillInput[0].activations,
        );
        await neutral(page);
        const hand: Hand = before.player.hand === 1 ? -1 : 1;
        const vector = await visibleSide(page, hand);
        const start = await state(page);
        await stick(page, vector);
        const samples = await record(page, 1.4);
        const after = await state(page);
        expect(after.player.hand, label).toBe(hand);
        expect(after.ballControl.hand, label).toBe(hand);
        expect(
          after.skillInput[0].activations - start.skillInput[0].activations,
          `${label}: held gesture repeats`,
        ).toBe(1);
        expect(after.skillInput[0].last?.hand).toBe(hand);
        expect(angleDifference(after.skillInput[0].last!.facing, angle)).toBeLessThan(1e-5);
        for (const f of samples) {
          expect(
            Math.hypot(f.player.x - start.player.x, f.player.z - start.player.z),
            `${label}: body drift`,
          ).toBeLessThan(0.02);
          expect(angleDifference(f.player.angle, angle), `${label}: body turned`).toBeLessThan(
            1e-5,
          );
          expect(f.gait?.moving, `${label}: automatic footstep`).toBe(false);
          expect(
            f.gait?.feet.every((foot) => foot.planted),
            `${label}: foot released while stationary`,
          ).toBe(true);
        }
        expect(
          samples.some((f) => f.control.crossing),
          `${label}: crossover not observed`,
        ).toBe(true);
        checkPath(samples, label);
        measurements.push({
          label,
          angle,
          hand,
          vector,
          before: start.player,
          after: after.player,
          skill: after.skillInput[0],
          samples,
        });
      }
      await page.screenshot({ path: info.outputPath('stationary-crossover.png') });
      expect(errors).toEqual([]);
    } finally {
      await writeFile(
        info.outputPath('orientation-measurements.json'),
        JSON.stringify(measurements),
      );
    }
  });

  test(`${legend}: SC-D3/D4 — crossover then drive and direction reversals retain the chosen hand`, async ({
    page,
  }, info) => {
    await prepare(page, legend, -1);
    const measurements: Record<string, unknown>[] = [];
    for (const hand of [1, -1] as const) {
      await requestHand(page, hand);
      const crossing = await record(page, 1.4);
      const afterCross = await state(page);
      expect(afterCross.ballControl.hand).toBe(hand);
      const completedTransfer =
        afterCross.ballControl.lastSkill?.kind === 'side' &&
        afterCross.ballControl.lastSkill.total === 1 &&
        afterCross.ballControl.lastSkill.initialHand === -hand;
      expect(
        crossing.some((frame) => frame.control.crossing) || completedTransfer,
        'the requested transfer must be observed or recorded as completed',
      ).toBe(true);
      // A rearmed gesture toward the active hand produces two quick outward bounces.
      await requestHand(page, hand);
      const sameHand = await record(
        page,
        config.ballControl.period + 2 * config.ballControl.skills.period + 0.1,
      );
      expect(sameHand.every((frame) => !frame.control.crossing)).toBe(true);
      expect(
        sameHand.some(
          (frame) => frame.control.skill?.kind === 'side' && frame.control.skill.total === 2,
        ),
        'same-hand gesture should trigger two rapid bounces',
      ).toBe(true);
      expect(sameHand.at(-1)!.control.lastSkill).toMatchObject({
        kind: 'side',
        initialHand: hand,
        total: 2,
      });
      const stationary = await state(page);
      const toBasket = movement.worldToStick(
        level.hoop.x - stationary.player.x,
        level.hoop.z - stationary.player.z,
      );
      // Keep the accepted right-stick gesture HELD while the body turns. Its meaning
      // must remain tied to activation; a direction reversal cannot reinterpret it.
      await page.evaluate(
        (v) => window.__TEST__!.setInput({ moveX: v.x * 0.65, moveZ: v.z * 0.65 }),
        toBasket,
      );
      const drive = await record(page, 1.3);
      await page.evaluate(
        (v) => window.__TEST__!.setInput({ moveX: -v.x * 0.65, moveZ: -v.z * 0.65 }),
        toBasket,
      );
      const reverse = await record(page, 1.3);
      await page.evaluate(() => window.__TEST__!.setInput({ moveX: 0, moveZ: 0 }));
      for (const frame of [...drive, ...reverse]) {
        expect(frame.player.hand).toBe(hand);
        expect(frame.control.hand).toBe(hand);
        expect(frame.control.crossing, 'locomotion silently requested crossover').toBe(false);
      }
      expect(
        Math.hypot(
          drive.at(-1)!.player.x - stationary.player.x,
          drive.at(-1)!.player.z - stationary.player.z,
        ),
      ).toBeGreaterThan(0.6);
      expect((await state(page)).skillInput[0].activations).toBe(
        stationary.skillInput[0].activations,
      );
      checkPath([...drive, ...reverse], 'drive/reverse');
      expect(checkContacts([...drive, ...reverse], 'drive/reverse')).toBeGreaterThanOrEqual(2);
      measurements.push({ hand, crossing, sameHand, drive, reverse });
      await advance(page, 0.4);
    }
    await writeFile(info.outputPath('drive-measurements.json'), JSON.stringify(measurements));
    await page.screenshot({ path: info.outputPath('drive-retains-hand.png') });
  });

  test(`${legend}: SC-D5/D6/D8 — post-up profile protects the chosen side through defender changes and transitions`, async ({
    page,
  }, info) => {
    await prepare(page, legend, 1);
    const samples: Record<string, Frame[]> = {};
    try {
      const before = await state(page);
      await post(page, true);
      samples.enter = await record(page, 1.0, true);
      await page.evaluate(() => window.__TEST__!.teleport('opponent', [5.1, 0.95, 0.7]));
      samples.defenderLeft = await record(page, 1.0, true);
      await page.evaluate(() => window.__TEST__!.teleport('opponent', [5.1, 0.95, -0.7]));
      samples.defenderRight = await record(page, 1.0, true);
      for (const frame of [...samples.defenderLeft, ...samples.defenderRight]) {
        expect(frame.player.hand).toBe(1);
        expect(frame.control.hand).toBe(1);
        expect(frame.control.crossing).toBe(false);
        expect(frame.control.postBlend).toBeGreaterThan(0.95);
        expect(frame.control.shape!.hipSide).toBeGreaterThan(config.ballControl[legend].hipSide);
        // These silhouettes are measured from the real GLB torso/hip skin, not render widths.
        const silhouette = legend === 'shaq' ? 0.303 : 0.347;
        expect(Math.abs(frame.control.local.x) - config.ball.radius).toBeGreaterThan(silhouette);
        const pose = frame.pose!;
        const shoulder = pose.joints.LeftArm,
          elbow = pose.joints.LeftForeArm;
        const behind =
          (elbow.x - shoulder.x) * Math.sin(frame.player.angle) +
          (elbow.z - shoulder.z) * Math.cos(frame.player.angle);
        expect(behind, 'post elbow behind torso').toBeGreaterThan(-0.06);
      }
      expect((await state(page)).skillInput[0].activations).toBe(before.skillInput[0].activations);
      await page.screenshot({ path: info.outputPath('protected-post-dribble.png') });
      const beforeBacking = await state(page);
      await page.evaluate(
        (p) => window.__TEST__!.teleport('opponent', [p.x - 1.05, 0.95, p.z]),
        beforeBacking.player,
      );
      await page.evaluate(
        (v) => window.__TEST__!.setInput({ moveX: v.x * 0.55, moveZ: v.z * 0.55 }),
        movement.worldToStick(-1, 0),
      );
      samples.backing = await record(page, 1.3, true);
      await page.evaluate(() => window.__TEST__!.setInput({ moveX: 0, moveZ: 0 }));
      expect(samples.backing.at(-1)!.player.x).toBeLessThan(beforeBacking.player.x - 0.15);
      expect(
        samples.backing.every(
          (f) => f.player.hand === 1 && f.control.hand === 1 && f.player.mode === 'post',
        ),
      ).toBe(true);
      await page.screenshot({ path: info.outputPath('protected-post-backing.png') });
      await requestHand(page, -1);
      samples.cross = await record(page, 1.4, true);
      await neutral(page);
      expect((await state(page)).ballControl.hand).toBe(-1);
      await post(page, false);
      samples.exit = await record(page, 0.8, true);
      expect((await state(page)).player.hand).toBe(-1);
      await post(page, true);
      samples.reenter = await record(page, 0.8, true);
      expect((await state(page)).player.hand).toBe(-1);
      await post(page, false);
      await page.evaluate(
        (v) => window.__TEST__!.setInput({ moveX: v.x * 0.55, moveZ: v.z * 0.55 }),
        movement.worldToStick(1, 0),
      );
      samples.drive = await record(page, 1.0, true);
      await page.evaluate(() => window.__TEST__!.setInput({ moveX: 0, moveZ: 0 }));
      expect(samples.drive.every((f) => f.player.hand === -1 && f.control.hand === -1)).toBe(true);
      let contacts = 0;
      for (const [label, frames] of Object.entries(samples)) {
        checkPath(frames, label);
        contacts += checkContacts(frames, label);
      }
      expect(contacts).toBeGreaterThanOrEqual(4);
    } finally {
      await writeFile(info.outputPath('post-measurements.json'), JSON.stringify(samples));
    }
  });

  test(`${legend}: SC-D7 — pause, reset and reconnect require a neutral gesture before another crossover`, async ({
    page,
  }, info) => {
    await prepare(page, legend, -1);
    await neutral(page);
    const vector = await visibleSide(page, -1);
    await stick(page, vector);
    await advance(page, 0.25);
    const baseline = await state(page);
    await page.keyboard.press('Escape');
    expect((await state(page)).screen).toBe('paused');
    await page.evaluate(
      (angle) => window.__TEST__!.setFacing!(0, angle + Math.PI),
      baseline.player.angle,
    );
    await page.keyboard.press('Escape');
    await advance(page, 0.4);
    expect((await state(page)).player.hand).toBe(-1);
    await neutral(page);
    await stick(page, await visibleSide(page, 1));
    await advance(page, 1.4);
    expect((await state(page)).ballControl.hand).toBe(1);
    await neutral(page);
    await stick(page, await visibleSide(page, 1));
    await advance(page, 0.2);
    const beforeDisconnect = await state(page);
    await page.evaluate(() => {
      window.__d1Pad.connected = false;
    });
    await page.evaluate(
      (angle) => window.__TEST__!.setFacing!(0, angle + Math.PI),
      beforeDisconnect.player.angle,
    );
    await advance(page, 0.25);
    await page.evaluate(() => {
      window.__d1Pad.connected = true;
    });
    await advance(page, 0.4);
    expect((await state(page)).player.hand).toBe(1);
    expect((await state(page)).skillInput[0].activations).toBe(0);
    await neutral(page);
    await page.evaluate(() => window.__TEST__!.setFacing!(0, -Math.PI / 2));
    await stick(page, await visibleSide(page, -1));
    await page.evaluate(async () => {
      await window.__TEST__!.reset(42, 'live');
      window.__TEST__!.setHandling!(0, 'dribble', 1);
    });
    await advance(page, 0.5);
    expect((await state(page)).player.hand).toBe(1);
    await requestHand(page, -1);
    await advance(page, 1.4);
    expect((await state(page)).ballControl.hand).toBe(-1);
    await writeFile(info.outputPath('lifecycle-state.json'), JSON.stringify(await state(page)));
  });
}
