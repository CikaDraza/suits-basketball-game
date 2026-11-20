import { writeFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { bootGame } from './helpers';
import { config } from '../../src/game/data/gameConfig';
import type { PushEvidence } from '../../src/game/simulation/defensivePush';

test.use({ viewport: { width: 800, height: 450 } });

declare global {
  interface Window {
    __d1axes: number[];
  }
}
async function pad(page: Page) {
  await page.addInitScript(() => {
    window.__d1axes = [0, 0, 0, 0];
    Object.defineProperty(navigator, 'getGamepads', {
      configurable: true,
      value: () => [
        {
          id: 'DEFENSE-1 pad',
          index: 0,
          connected: true,
          mapping: 'standard',
          timestamp: performance.now(),
          axes: [...window.__d1axes],
          buttons: Array.from({ length: 16 }, () => ({ pressed: false, value: 0, touched: false })),
        },
      ],
    });
  });
}
async function rs(page: Page, action: 'left' | 'brace' | 'none') {
  if (action !== 'none') {
    await page.evaluate(() => {
      window.__d1axes = [0, 0, 0, 0];
    });
    await page.waitForFunction(() => {
      const debug = window.__TEST__!.getRightStickDebug!(0);
      return (
        (window.__TEST__!.getState().time as number) > 0.1 &&
        debug?.context === 'defense' &&
        debug.eligible &&
        debug.phase === 'armed'
      );
    });
  }
  await page.evaluate((action) => {
    if (action === 'none') {
      window.__d1axes = [0, 0, 0, 0];
      return;
    }
    const seam = window.__TEST__!;
    const p = seam.getState().player as { x: number; z: number; angle: number };
    const origin = seam.project!([p.x, 1.3, p.z]);
    const tip = seam.project!([p.x + Math.sin(p.angle), 1.3, p.z + Math.cos(p.angle)]);
    const dx = tip.x - origin.x,
      dy = tip.y - origin.y,
      length = Math.hypot(dx, dy);
    window.__d1axes[2] = (action === 'left' ? dy : -dx) / length;
    window.__d1axes[3] = (action === 'left' ? -dx : -dy) / length;
  }, action);
  await expect
    .poll(() =>
      page.evaluate(
        () => (window.__TEST__!.getState().player as { defenseHands: string }).defenseHands,
      ),
    )
    .toBe(action);
}

async function forwardPush(page: Page) {
  await page.evaluate(async () => {
    const seam = window.__TEST__!;
    const frame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    const player = () =>
      seam.getState().player as { x: number; z: number; angle: number; defenseHands: string };
    const flick = (active: boolean) => {
      window.__d1axes = [0, 0, 0, 0];
      if (!active) return;
      const p = player(),
        origin = seam.project!([p.x, 1.3, p.z]);
      const tip = seam.project!([p.x + Math.sin(p.angle), 1.3, p.z + Math.cos(p.angle)]);
      const dx = tip.x - origin.x,
        dy = tip.y - origin.y,
        length = Math.hypot(dx, dy);
      window.__d1axes[2] = dx / length;
      window.__d1axes[3] = dy / length;
    };
    flick(false);
    await frame();
    await frame();
    flick(true);
    for (let n = 0; n < 30 && player().defenseHands !== 'up'; n++) await frame();
    flick(false);
    for (let n = 0; n < 30 && player().defenseHands !== 'none'; n++) await frame();
    flick(true);
    await frame();
    await frame();
  });
}

for (const legend of ['shaq', 'chuck'] as const) {
  test(`${legend}: a repeated push inside cooldown stays rejected while the earlier motion finishes`, async ({
    page,
  }, info) => {
    await pad(page);
    await bootGame(page);
    await page.evaluate((legend) => window.__TEST__!.setLegend!(0, legend), legend);
    await page.getByRole('button', { name: 'Pause', exact: true }).click();
    await page.getByRole('button', { name: 'TRAINING', exact: true }).click();
    await page.getByRole('button', { name: /FREE MOVEMENT/ }).click();
    await page.getByRole('button', { name: /START TRAINING/ }).click();
    await rs(page, 'brace');
    await forwardPush(page);
    await forwardPush(page);
    await page.waitForTimeout(900);
    const debug = await page.evaluate(() => window.__TEST__!.getGameplayDebug!(0));
    await writeFile(info.outputPath('cooldown.json'), JSON.stringify(debug, null, 2));
    const pushes = debug.commands.filter((r) => r.action === 'defense_push');
    expect(pushes.some((r) => r.execution)).toBe(true);
    const rejected = pushes.find((r) => r.decision?.reason === 'push-cooldown');
    expect(rejected).toBeDefined();
    expect(rejected!.execution).toBeNull();
    expect(rejected!.observation).toBeNull();
    expect((await page.evaluate(() => window.__TEST__!.getState())).defensePushes).toBe(0);
  });

  test(`${legend}: a push can animate inside capsule range without contact, then applies once at measured forearm reach`, async ({
    page,
  }, info) => {
    test.setTimeout(60_000);
    await pad(page);
    await bootGame(page);
    await page.evaluate(async (legend) => {
      window.__TEST__!.setLegend!(0, legend);
      await window.__TEST__!.reset(42, 'live');
      window.__TEST__!.teleport('player', [6, 0.95, 0]);
      window.__TEST__!.teleport('opponent', [6, 0.95, 1.25]);
      window.__TEST__!.teleport('ball', [12, 0.14, -5]);
      window.__TEST__!.setFacing!(0, 0);
      window.__TEST__!.diagnostics!.start();
    }, legend);
    await page.waitForFunction(() => window.__TEST__!.getLocomotion!(0));
    const push = () =>
      page.evaluate(() => {
        const physics = window.__TEST__!.getGameplayDebug!(0).physics as {
          players: { push: PushEvidence | null }[];
        } | null;
        return physics?.players[0].push;
      });
    await rs(page, 'brace');
    await page.waitForTimeout(600);
    await forwardPush(page);
    await page.waitForTimeout(1000);
    await expect.poll(async () => (await push())?.animationPerformed).toBe(true);
    const missed = await push();
    expect(missed!.withinRange).toBe(true);
    expect(missed!.contactEstablished).toBe(false);
    expect(missed!.impulseApplied).toBe(false);
    expect((await page.evaluate(() => window.__TEST__!.getState())).defensePushes).toBe(0);
    await rs(page, 'none');
    await page.evaluate(() => {
      window.__TEST__!.teleport('opponent', [6, 0.95, 0.85]);
      window.__TEST__!.setFacing!(0, 0);
    });
    await rs(page, 'brace');
    await page.waitForTimeout(700);
    const firstStepCount = await page.evaluate(() => window.__TEST__!.getLocomotion!(1)!.steps);
    await forwardPush(page);
    await expect
      .poll(() => page.evaluate(() => window.__TEST__!.getLocomotion!(1)!.steps))
      .toBeGreaterThan(firstStepCount);
    await writeFile(
      info.outputPath('contact-attempt.json'),
      JSON.stringify(
        await page.evaluate(() => ({
          pose: window.__TEST__!.getCharacterPose!(0),
          gait: window.__TEST__!.getLocomotion!(0),
          recording: window.__TEST__!.diagnostics!.export(),
        })),
        null,
        2,
      ),
    );
    await expect.poll(() => page.evaluate(() => window.__TEST__!.getState().defensePushes)).toBe(1);
    await page.waitForTimeout(900);
    const hit = await push();
    expect(hit!.contactEstablished).toBe(true);
    expect(hit!.impulseApplied).toBe(true);
    expect(hit!.displacement).toBeGreaterThan(0.1);
    expect((await page.evaluate(() => window.__TEST__!.getState())).defensePushes).toBe(1);
    await writeFile(
      info.outputPath('push-evidence.json'),
      JSON.stringify(
        {
          missed,
          hit,
          recording: await page.evaluate(() => window.__TEST__!.diagnostics!.export()),
        },
        null,
        2,
      ),
    );
    await page.screenshot({ path: info.outputPath('after-controlled-shove.png') });
  });
  test(`${legend}: Free Movement shows asymmetric Brace and all Push phases without inventing contact`, async ({
    page,
  }, info) => {
    test.setTimeout(75_000);
    await pad(page);
    await bootGame(page);
    await page.evaluate(async (legend) => {
      window.__TEST__!.setLegend!(0, legend);
      await window.__TEST__!.reset(42, 'live');
    }, legend);
    await page.getByRole('button', { name: 'Pause', exact: true }).click();
    await page.getByRole('button', { name: 'TRAINING', exact: true }).click();
    await page.getByRole('button', { name: /FREE MOVEMENT/ }).click();
    await page.getByRole('button', { name: /START TRAINING/ }).click();
    await page.waitForFunction(() => window.__TEST__!.getLocomotion!(0));
    await page.evaluate(() => window.__TEST__!.diagnostics!.start());
    await rs(page, 'brace');
    await page.waitForTimeout(700);
    const poses = [];
    for (const view of ['front', 'side', 'rear'] as const) {
      await page.evaluate((view) => window.__TEST__!.inspectCharacter!(view), view);
      await page.waitForTimeout(150);
      const pose = await page.evaluate(() => ({
        pose: window.__TEST__!.getCharacterPose!(0)!,
        gait: window.__TEST__!.getLocomotion!(0)!,
      }));
      expect(pose.gait.contact!.virtual).toBe(true);
      expect(pose.gait.contact!.contactValid).toBe(false);
      const active = pose.gait.contact!.selectedArm === 'left' ? 0 : 1;
      expect(pose.pose.defensiveArms[active].elbowFlex).toBeGreaterThan(75);
      expect(pose.pose.defensiveArms[active].elbowFlex).toBeLessThan(110);
      expect(pose.pose.defensiveArms[1 - active].elbowFlex).toBeLessThan(18);
      poses.push(pose);
      await page.screenshot({ path: info.outputPath(`brace-${view}.png`) });
    }
    await page.evaluate(() => window.__TEST__!.inspectCharacter!(null));
    await forwardPush(page);
    const phases = await page.evaluate(async () => {
      const seam = window.__TEST__!,
        result = [];
      const until = (seam.getState().time as number) + 1.2;
      while ((seam.getState().time as number) < until) {
        result.push({ time: seam.getState().time, gait: seam.getLocomotion!(0)! });
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      }
      return result;
    });
    expect(phases.some((s) => s.gait.contact?.phase === 'preparation')).toBe(true);
    expect(phases.some((s) => s.gait.contact?.phase === 'extension')).toBe(true);
    expect(phases.some((s) => s.gait.contact?.phase === 'recovery')).toBe(true);
    expect((await page.evaluate(() => window.__TEST__!.getState())).defensePushes).toBe(0);
    await writeFile(
      info.outputPath('contact-evidence.json'),
      JSON.stringify(
        {
          poses,
          phases,
          recording: await page.evaluate(() => window.__TEST__!.diagnostics!.export()),
        },
        null,
        2,
      ),
    );
  });
  test(`${legend}: stance faces front, sides, rear and diagonal opponents through camera changes and lateral movement`, async ({
    page,
  }, info) => {
    test.setTimeout(90_000);
    await bootGame(page);
    await page.evaluate(async (legend) => {
      window.__TEST__!.setLegend!(0, legend);
      await window.__TEST__!.reset(42, 'live');
      window.__TEST__!.teleport('player', [6, 0.95, 0]);
      window.__TEST__!.teleport('opponent', [6, 0.95, 2]);
      window.__TEST__!.teleport('ball', [12, 0.14, -5]);
    }, legend);
    await page.waitForFunction(() => window.__TEST__!.getLocomotion!(0) != null);
    await page.keyboard.press('q');
    const samples = [];
    for (const [dx, dz] of [
      [0, 2],
      [2, 0],
      [-2, 0],
      [0, -2],
      [1.4, 1.4],
    ]) {
      await page.evaluate(
        ([dx, dz]) => {
          window.__TEST__!.teleport('opponent', [6 + dx, 0.95, dz]);
        },
        [dx, dz],
      );
      await expect
        .poll(() =>
          page.evaluate(() => {
            const g = window.__TEST__!.getLocomotion!(0)?.movement;
            if (!g) return Infinity;
            return Math.abs(
              Math.atan2(
                Math.sin(g.requestedYaw - g.actualYaw),
                Math.cos(g.requestedYaw - g.actualYaw),
              ),
            );
          }),
        )
        .toBeLessThan(0.04);
      await page.waitForTimeout(500);
      const snapshot = await page.evaluate(() => ({
        gait: window.__TEST__!.getLocomotion!(0)!,
        pose: window.__TEST__!.getCharacterPose!(0)!,
      }));
      expect(snapshot.pose.bodyY).toBeLessThan(0.95);
      expect(Math.min(snapshot.pose.leftSoleY, snapshot.pose.rightSoleY)).toBeGreaterThan(-0.012);
      expect(Math.min(snapshot.pose.leftSoleY, snapshot.pose.rightSoleY)).toBeLessThan(0.03);
      samples.push(snapshot);
    }
    for (const view of ['front', 'side', 'rear'] as const) {
      await page.evaluate((view) => window.__TEST__!.inspectCharacter!(view), view);
      await page.waitForTimeout(250);
      const g = await page.evaluate(() => window.__TEST__!.getLocomotion!(0)!.movement!);
      expect(
        Math.abs(
          Math.atan2(
            Math.sin(g.requestedYaw - Math.PI / 4),
            Math.cos(g.requestedYaw - Math.PI / 4),
          ),
        ),
      ).toBeLessThan(0.04);
      await page.screenshot({ path: info.outputPath(`stance-${view}.png`) });
    }
    await page.evaluate(() => window.__TEST__!.inspectCharacter!(null));
    const moving = await page.evaluate(async (inputAngle) => {
      const seam = window.__TEST__!,
        result = [];
      for (let frame = 0; frame < 45; frame++) {
        const state = seam.getState(),
          p = state.player as { x: number; z: number },
          o = state.opponent as { x: number; z: number };
        const yaw = Math.atan2(o.x - p.x, o.z - p.z);
        const dx = Math.cos(yaw) * 0.6,
          dz = -Math.sin(yaw) * 0.6;
        seam.setInput({
          moveX: dx * Math.cos(inputAngle) - dz * Math.sin(inputAngle),
          moveZ: -(dx * Math.sin(inputAngle) + dz * Math.cos(inputAngle)),
        });
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        result.push({ x: p.x, z: p.z, gait: seam.getLocomotion!(0)! });
      }
      seam.setInput({ moveX: 0, moveZ: 0 });
      return result;
    }, config.camera.inputAngle);
    expect(
      Math.hypot(moving.at(-1)!.x - moving[0].x, moving.at(-1)!.z - moving[0].z),
    ).toBeGreaterThan(0.1);
    expect(moving.some((s) => s.gait.locomotion === 'strafe')).toBe(true);
    const gaitFeet = moving.flatMap((s) => s.gait.feet.filter((f) => f.planted));
    expect(Math.max(...gaitFeet.map((f) => f.slidingSpeed))).toBeLessThan(0.2);
    await writeFile(
      info.outputPath('rotation-evidence.json'),
      JSON.stringify({ samples, moving }, null, 2),
    );
  });
  test(`${legend}: real RS ownership, neutral ready and Q exit restore natural movement`, async ({
    page,
  }, info) => {
    test.setTimeout(60_000);
    await pad(page);
    await bootGame(page);
    await page.evaluate(async (legend) => {
      window.__TEST__!.setLegend!(0, legend);
      await window.__TEST__!.reset(42, 'live');
    }, legend);
    await page.getByRole('button', { name: 'Pause', exact: true }).click();
    await page.getByRole('button', { name: 'TRAINING', exact: true }).click();
    await page.getByRole('button', { name: /FREE MOVEMENT/ }).click();
    await page.getByRole('button', { name: /START TRAINING/ }).click();
    await page.evaluate(() => window.__TEST__!.diagnostics!.start());
    await page.keyboard.press('q');
    await page.waitForTimeout(600);
    await rs(page, 'left');
    await page.waitForTimeout(500);
    await rs(page, 'none');
    await page.waitForTimeout(800);
    const ready = await page.evaluate(() => ({
      pose: window.__TEST__!.getCharacterPose!(0)!,
      gait: window.__TEST__!.getLocomotion!(0)!,
    }));
    for (const arm of ready.pose.defensiveArms) {
      expect(arm.weight).toBeGreaterThan(0.95);
      expect(arm.wrist.y).toBeLessThan(arm.shoulder.y - 0.1);
    }
    if (legend === 'shaq') expect(ready.gait.importedDefense!.armOwner).toBe('defensive-arm-ik');
    await page.screenshot({ path: info.outputPath('ready-after-neutral.png') });
    if (legend === 'shaq') {
      await page.waitForFunction(
        () => (window.__TEST__!.getState().player as { jump: { grounded: boolean } }).jump.grounded,
      );
      await page.keyboard.press('f');
      await page.waitForFunction(
        () =>
          (window.__TEST__!.getState().player as { jump: { takeoffs: number } }).jump.takeoffs ===
          1,
      );
      await page.waitForFunction(
        () =>
          (window.__TEST__!.getState().player as { jump: { phase: string } }).jump.phase ===
          'grounded',
      );
      const afterJump = await page.evaluate(
        () => window.__TEST__!.getLocomotion!(0)!.importedDefense!,
      );
      expect(afterJump.armsOwned).toBe(true);
      expect(afterJump.armOwner).toBe('defensive-arm-ik');
    }
    await page.keyboard.press('q');
    await expect
      .poll(() => page.evaluate(() => window.__TEST__!.getLocomotion!(0)!.upper))
      .toBe('relaxed');
    await page.keyboard.down('d');
    try {
      await expect
        .poll(() => page.evaluate(() => window.__TEST__!.getLocomotion!(0)!.moving))
        .toBe(true);
      if (legend === 'shaq') {
        await expect
          .poll(() =>
            page.evaluate(() => window.__TEST__!.getLocomotion!(0)!.importedWalk!.appliedArms),
          )
          .toBe(8);
      }
      await expect
        .poll(() =>
          page.evaluate(() => window.__TEST__!.getCharacterPose!(0)!.defensiveArms[0].weight),
        )
        .toBe(0);
      await page.screenshot({ path: info.outputPath('natural-walk.png') });
    } finally {
      await page.keyboard.up('d');
    }
    if (legend === 'shaq') {
      await page.keyboard.press('q');
      await expect
        .poll(() =>
          page.evaluate(() => window.__TEST__!.getLocomotion!(0)!.importedDefense!.armsOwned),
        )
        .toBe(false);
    }
    await writeFile(
      info.outputPath('stance-evidence.json'),
      JSON.stringify(
        { ready, recording: await page.evaluate(() => window.__TEST__!.diagnostics!.export()) },
        null,
        2,
      ),
    );
  });
}

for (const legend of ['shaq', 'chuck'] as const) {
  test(`${legend}: a diagonal approach from low stance makes contact in 1v1 Defense Practice`, async ({
    page,
  }, info) => {
    test.setTimeout(60_000);
    await pad(page);
    await bootGame(page);
    await page.evaluate((legend) => window.__TEST__!.setLegend!(0, legend), legend);
    await page.getByRole('button', { name: 'Pause', exact: true }).click();
    await page.getByRole('button', { name: 'TRAINING', exact: true }).click();
    await page.getByRole('button', { name: /1v1 PRACTICE/ }).click();
    await page.getByRole('button', { name: 'DEFENSE', exact: true }).click();
    await page.getByRole('button', { name: /START TRAINING/ }).click();
    await expect
      .poll(() => page.evaluate(() => window.__TEST__!.getState().inbound))
      .toMatchObject({ owner: 1 });
    await page.evaluate(() => {
      const seam = window.__TEST__!;
      seam.teleport('opponent', [6.45, 0.95, 1.25]);
      seam.teleport('player', [6, 0.95, -0.55]);
    });
    await expect
      .poll(() => page.evaluate(() => window.__TEST__!.getState().inbound), { timeout: 18_000 })
      .toMatchObject({ stage: 'pass', owner: 1 });
    await page.evaluate(() => window.__TEST__!.requestInboundPass!(1));
    await expect.poll(() => page.evaluate(() => window.__TEST__!.getState().owner)).toBe(1);
    await page.keyboard.press('q');
    await expect
      .poll(() =>
        page.evaluate(() => (window.__TEST__!.getState().player as { mode: string }).mode),
      )
      .toBe('post');
    const approach = await page.evaluate(
      async ({ inputAngle, radius }) => {
        const seam = window.__TEST__!;
        const until = (seam.getState().time as number) + 3;
        const samples = [];
        seam.diagnostics!.start();
        while ((seam.getState().time as number) < until) {
          const state = seam.getState();
          const p = state.player as { x: number; z: number };
          const o = state.opponent as { x: number; z: number };
          const dx = o.x - p.x,
            dz = o.z - p.z,
            distance = Math.hypot(dx, dz);
          samples.push({ distance, p, o, movement: seam.getLocomotion!(0)?.movement });
          if (distance < 2 * radius + 0.045) break;
          window.__d1axes[0] =
            (0.7 * (dx * Math.cos(inputAngle) - dz * Math.sin(inputAngle))) / distance;
          window.__d1axes[1] =
            (0.7 * (dx * Math.sin(inputAngle) + dz * Math.cos(inputAngle))) / distance;
          await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        }
        window.__d1axes = [0, 0, 0, 0];
        return samples;
      },
      { inputAngle: config.camera.inputAngle, radius: config.physics.radius },
    );
    await writeFile(info.outputPath('approach.json'), JSON.stringify(approach, null, 2));
    expect(approach[0].distance - approach.at(-1)!.distance).toBeGreaterThan(0.5);
    expect(approach.at(-1)!.distance).toBeLessThan(2 * config.physics.radius + 0.045);
    expect(await page.evaluate(() => window.__TEST__!.getState().bumps)).toBe(0);
    await rs(page, 'brace');
    await page.evaluate(() => window.__TEST__!.inspectCharacter!('side'));
    // Wait for the arm to settle while keeping the game on a real physics clock.
    await page.waitForFunction(
      (from) => (window.__TEST__!.getState().time as number) > from + 0.35,
      await page.evaluate(() => window.__TEST__!.getState().time as number),
    );
    const brace = await page.evaluate(() => ({
      contact: window.__TEST__!.getLocomotion!(0)?.contact,
      pose: window.__TEST__!.getCharacterPose!(0),
      state: window.__TEST__!.getState(),
    }));
    await writeFile(info.outputPath('brace.json'), JSON.stringify(brace, null, 2));
    await page.screenshot({ path: info.outputPath('practice-brace.png') });
    expect(brace.contact?.contactValid).toBe(true);
    await page.evaluate(() => window.__TEST__!.inspectCharacter!(null));
    await forwardPush(page);
    await expect.poll(() => page.evaluate(() => window.__TEST__!.getState().defensePushes)).toBe(1);
    await expect.poll(() => page.evaluate(() => window.__TEST__!.getState().owner)).toBe(1);
    await writeFile(
      info.outputPath('practice-contact.json'),
      JSON.stringify(
        await page.evaluate(() => ({
          event: window.__TEST__!.diagnostics!.export(),
          player: window.__TEST__!.getLocomotion!(0),
          opponent: window.__TEST__!.getLocomotion!(1),
        })),
        null,
        2,
      ),
    );
  });
}
