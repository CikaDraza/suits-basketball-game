import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { bootGame } from './helpers';
import type { Fighter } from '../../src/game/simulation/types';
import type { DiagnosticEvent } from '../../src/game/diagnostics/recorder';

test.use({ viewport: { width: 1100, height: 650 } });
declare global {
  interface Window {
    __diagAxes: number[];
    __diagButtons: number[];
  }
}
const trace = (page: Page, recentOnly = false) =>
  page.evaluate((recent) => window.__TEST__!.diagnostics!.export(recent), recentOnly);
const events = async (page: Page) => (await trace(page)).events;
async function bootTraining(page: Page) {
  await page.goto('./');
  await page.waitForFunction(
    () => window.__TEST__?.ready && window.__TEST__.getEntities().length === 5,
  );
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await page.getByRole('button', { name: 'TRAINING', exact: true }).click();
  await page.getByRole('button', { name: /START TRAINING/ }).click();
  await expect.poll(() => page.evaluate(() => window.__TEST__!.getEntities().length)).toBe(3);
}
async function installPad(page: Page) {
  await page.addInitScript(() => {
    window.__diagAxes = [0, 0, 0, 0];
    window.__diagButtons = [];
    Object.defineProperty(navigator, 'getGamepads', {
      configurable: true,
      value: () => [
        {
          id: 'Diagnostics browser controller',
          index: 0,
          connected: true,
          mapping: 'standard',
          timestamp: performance.now(),
          axes: [...window.__diagAxes],
          buttons: Array.from({ length: 16 }, (_, i) => ({
            value: Number(window.__diagButtons.includes(i)),
            pressed: window.__diagButtons.includes(i),
            touched: false,
          })),
        },
      ],
    });
  });
}
async function neutral(page: Page) {
  await page.evaluate(() => {
    window.__diagAxes = [0, 0, 0, 0];
  });
  await expect
    .poll(() => page.evaluate(() => window.__TEST__!.getRightStickDebug!(0)?.phase))
    .toBe('armed');
}
async function reach(page: Page, sign = 1) {
  await page.evaluate((sign) => {
    const d = window.__TEST__!.getRightStickDebug!(0)!;
    window.__diagAxes = [0, 0, -sign * d.screenForward.z, -sign * d.screenForward.x];
  }, sign);
}

test('manual record/export correlates physical RS, gameplay acceptance and actual arm layer while widget is closed', async ({
  page,
}, info) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('response', (r) => {
    if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`);
  });
  await installPad(page);
  await bootTraining(page);
  await neutral(page);
  await page.getByRole('button', { name: /RS debug/ }).click();
  await page.getByRole('button', { name: '● RECORD', exact: true }).click();
  await page.getByRole('button', { name: /RS debug/ }).click();
  await reach(page);
  await expect
    .poll(async () =>
      (await events(page)).some(
        (e) =>
          e.type === 'animation.active' &&
          e.commandId !== undefined &&
          (e.data as { defense: string }).defense === 'left',
      ),
    )
    .toBe(true);
  await page.waitForTimeout(250);
  const recorded = await trace(page);
  const requested = recorded.events.find(
    (e) => e.type === 'command.requested' && e.action === 'defense_left',
  )!;
  expect(requested).toBeDefined();
  for (const type of ['command.accepted', 'command.executed', 'animation.active'])
    expect(recorded.events.some((e) => e.type === type && e.commandId === requested.sequence)).toBe(
      true,
    );
  expect(
    recorded.events.some(
      (e) =>
        e.type === 'input.gamepad' &&
        (e.data as { device: string }).device === 'Diagnostics browser controller',
    ),
  ).toBe(true);
  const pose = recorded.samples.find(
    (s) =>
      s.channel === 'pose' && s.slot === 0 && (s.data as { defense: string }).defense === 'left',
  );
  expect(pose).toBeDefined();
  const data = pose!.data as {
    layers: { arms: string };
    joints: Record<string, { quaternion: number[] }>;
    defensiveArms: unknown[];
  };
  expect(data.layers.arms).toBe('defensive-arm-ik');
  expect(data.joints.LeftForeArm.quaternion).toHaveLength(4);
  expect(data.defensiveArms).toHaveLength(2);
  expect(
    recorded.samples
      .filter((s) => s.channel === 'pose')
      .some((s) =>
        (s.data as { warnings: { rule: string }[] }).warnings.some(
          (w) => w.rule === 'POSE-NONFINITE',
        ),
      ),
  ).toBe(false);
  expect(recorded.samples.some((s) => s.channel === 'checkpoint')).toBe(true);
  const raw = recorded.events.find((e) => e.type === 'input.gamepad')!.data as {
    mapped: { resolvedFrame: { kind: string; body: { left: number } } };
  };
  expect(raw.mapped.resolvedFrame.kind).toBe('side');
  expect(raw.mapped.resolvedFrame.body.left).toBeGreaterThan(0.9);
  expect(recorded.samples.some((s) => s.channel === 'simulation')).toBe(true);
  const metadata = recorded.contexts.at(-1)!.metadata as {
    build: { commit: string; codeSha256AtServerStart: string; sha256: Record<string, string> };
    session: { drill: string };
    initialSeed: number;
  };
  expect(metadata.session.drill).toBe('movement');
  expect(metadata.build.commit).toMatch(/^[a-f0-9]{40}$/);
  expect(metadata.build.codeSha256AtServerStart).toMatch(/^[a-f0-9]{64}$/);
  expect(Object.values(metadata.build.sha256).every((hash) => /^[a-f0-9]{64}$/.test(hash))).toBe(
    true,
  );
  expect(metadata.initialSeed).toBe(42);
  await page.getByRole('button', { name: /RS debug/ }).click();
  await expect(page.getByTestId('motion-active-pose')).toContainText('left');
  await expect(page.getByTestId('motion-intent')).toHaveText('defense_left');
  await expect(page.getByTestId('motion-decision')).toHaveText('executed');
  await page.screenshot({ path: info.outputPath('motion-audit.png') });
  await page.getByRole('heading', { name: 'BODY', exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath('body-ball-audit.png') });
  await page.getByRole('heading', { name: /TIMELINE/ }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath('event-timeline.png') });
  await page.getByRole('button', { name: 'RS DETAILS', exact: true }).click();
  await expect(page.getByTestId('right-stick-action')).toContainText('defense');
  await page.screenshot({ path: info.outputPath('right-stick-details.png') });
  await page.getByRole('button', { name: 'STOP', exact: true }).click();
  const stopped = await trace(page);
  await neutral(page);
  await reach(page, -1);
  await page.waitForTimeout(250);
  expect((await trace(page)).events).toEqual(stopped.events);
  expect((await trace(page)).samples).toEqual(stopped.samples);
  const downloadWait = page.waitForEvent('download');
  await page.getByRole('button', { name: 'EXPORT JSON', exact: true }).click();
  const download = await downloadWait;
  const path = info.outputPath('exported-diagnostic.json');
  await download.saveAs(path);
  const exported = JSON.parse(await readFile(path, 'utf8'));
  expect(exported.schema).toBe('suits.motion-diagnostics');
  expect(exported.events).toEqual(stopped.events);
  expect(exported.replay.supported).toBe(false);
  expect(exported.events.every((e: DiagnosticEvent) => Number.isInteger(e.tick))).toBe(true);
  expect(errors).toEqual([]);
});

test('keyboard/touch button audit reports actual actions and rejections; pause and character resets are distinct epochs', async ({
  page,
}, info) => {
  test.setTimeout(90_000);
  await bootTraining(page);
  await page.getByRole('button', { name: /RS debug/ }).click();
  await page.getByRole('button', { name: '● RECORD', exact: true }).click();
  // Pointer activation of the widget must not steal keyboard gameplay focus.
  await page.keyboard.press('q');
  await expect
    .poll(async () =>
      (await events(page)).some(
        (e) => e.type === 'command.executed' && e.action === 'stance_or_special',
      ),
    )
    .toBe(true);
  await page.keyboard.press('z');
  await expect
    .poll(async () =>
      (await events(page)).some(
        (e) =>
          e.type === 'command.rejected' &&
          e.action === 'hand_change' &&
          e.reason === 'not-ball-owner',
      ),
    )
    .toBe(true);
  await page.getByRole('button', { name: 'Square: shoot / contest' }).click();
  await expect
    .poll(async () =>
      (await events(page)).some(
        (e) =>
          e.type === 'input.bridge' &&
          (e.data as { source: string; control: string }).source === 'touch' &&
          (e.data as { control: string }).control === 'square',
      ),
    )
    .toBe(true);
  await page.keyboard.down('d');
  await page.waitForTimeout(350);
  await page.keyboard.up('d');
  await expect
    .poll(async () =>
      (await events(page)).some((e) => e.action === 'move' && e.type === 'command.requested'),
    )
    .toBe(true);
  await page.keyboard.press('Escape');
  await expect
    .poll(async () =>
      (await events(page)).some(
        (e) => e.type === 'session.screen' && (e.data as { to: string }).to === 'paused',
      ),
    )
    .toBe(true);
  await page.getByRole('button', { name: /RS debug/ }).click();
  await page.locator('.matchup section').first().getByRole('button', { name: /CHUCK/ }).click();
  await page.getByRole('button', { name: /BACK TO BUSINESS/ }).click();
  await page.waitForTimeout(200);
  const result = await trace(page);
  expect(new Set(result.contexts.map((c) => c.revision)).size).toBeGreaterThan(1);
  for (const revision of new Set(result.events.map((e) => e.revision))) {
    const epoch = result.events.filter((e) => e.revision === revision);
    for (let i = 1; i < epoch.length; i++) {
      expect(epoch[i].tick).toBeGreaterThanOrEqual(epoch[i - 1].tick);
      expect(epoch[i].simulationTime).toBeGreaterThanOrEqual(epoch[i - 1].simulationTime);
    }
  }
  expect(result.events.some((e) => e.type === 'input.flush')).toBe(true);
  await page.getByRole('button', { name: /RS debug/ }).click();
  await page.getByRole('button', { name: 'STOP', exact: true }).click();
  await mkdir('playtest/diag-1', { recursive: true });
  await writeFile(
    'playtest/diag-1/keyboard-touch.json',
    JSON.stringify(await trace(page), null, 2),
  );
  await page.screenshot({ path: info.outputPath('chuck-audit.png') });
  await page.setViewportSize({ width: 812, height: 375 });
  await page.getByRole('button', { name: 'Square: shoot / contest' }).click();
  await page.getByRole('button', { name: 'Triangle: post / spin' }).click();
  await page.screenshot({ path: info.outputPath('phone-audit.png') });
});

test('Duel records accepted crossover and rejected busy/ownership commands without a second controller', async ({
  page,
}, info) => {
  test.setTimeout(90_000);
  await installPad(page);
  await bootGame(page);
  await page.evaluate(() => {
    window.__TEST__!.setHandling!(0, 'dribble', 1);
    window.__TEST__!.teleport('opponent', [1, 0.95, 6]);
    window.__TEST__!.diagnostics!.start();
  });
  await page.evaluate(async () => {
    const seam = window.__TEST__!;
    const frame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));
    const stick = (sign: number) => {
      const d = seam.getRightStickDebug!(0)!;
      window.__diagAxes = [0, 0, -sign * d.screenForward.z, -sign * d.screenForward.x];
    };
    window.__diagAxes = [0, 0, 0, 0];
    await frame();
    await frame();
    stick(1);
    for (let i = 0; i < 40 && !(seam.getState().ballControl as { skill: unknown }).skill; i++)
      await frame();
    window.__diagAxes = [0, 0, 0, 0];
    await frame();
    await frame();
    stick(-1);
    await frame();
    await frame();
  });
  await expect
    .poll(async () =>
      (await events(page)).some(
        (e) => e.type === 'command.rejected' && e.reason === 'crossing-active',
      ),
    )
    .toBe(true);
  const result = await trace(page);
  const command = result.events.find(
    (e) => e.type === 'command.executed' && e.action === 'crossover_side',
  )!;
  expect(
    result.events.some((e) => e.type === 'command.queued' && e.commandId === command.commandId),
  ).toBe(true);
  expect(
    result.events.some((e) => e.type === 'command.accepted' && e.commandId === command.commandId),
  ).toBe(true);
  await page.evaluate(() => window.__TEST__!.diagnostics!.stop());
  await writeFile(
    info.outputPath('duel-skill-trace.json'),
    JSON.stringify(await trace(page), null, 2),
  );
  expect(((await page.evaluate(() => window.__TEST__!.getState())).player as Fighter).legend).toBe(
    'shaq',
  );
});

test('production omits the recorder and diagnostic widget while Training works normally', async ({
  page,
}) => {
  test.skip(
    !process.env.PLAYWRIGHT_EXPECT_PRODUCTION,
    'Run against npm run preview with PLAYWRIGHT_EXPECT_PRODUCTION=1',
  );
  await bootTraining(page);
  expect(await page.evaluate(() => window.__TEST__!.mode)).toBe('prod');
  expect(await page.evaluate(() => window.__TEST__!.diagnostics)).toBeUndefined();
  await expect(page.getByRole('button', { name: /RS debug/ })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'SUITS MOTION DIAGNOSTICS' })).toHaveCount(0);
});
