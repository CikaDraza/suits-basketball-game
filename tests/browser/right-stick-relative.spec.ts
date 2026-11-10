import { mkdir, writeFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { bootGame } from './helpers';
import type { RightStickSnapshot } from '../../src/game/input/rightStickDebug';

test.use({ viewport: { width: 900, height: 500 } });
const directory = 'playtest/right-stick-relative-1';
declare global {
  interface Window {
    __relativeAxes: number[];
    __relativeConnected: boolean;
  }
}
async function installPad(page: Page) {
  await page.addInitScript(() => {
    window.__relativeAxes = [0, 0, 0, 0];
    window.__relativeConnected = true;
    Object.defineProperty(navigator, 'getGamepads', {
      configurable: true,
      value: () => [
        {
          id: 'RS-relative physical-axis test',
          index: 0,
          connected: window.__relativeConnected,
          mapping: 'standard',
          timestamp: performance.now(),
          axes: [...window.__relativeAxes],
          buttons: Array.from({ length: 16 }, () => ({ pressed: false, touched: false, value: 0 })),
        },
      ],
    });
  });
}

for (const legend of ['shaq', 'chuck'] as const) {
  test(`${legend}: real gameplay camera, eight visible facings, physical cardinal and intermediate stick angles in both contexts`, async ({
    page,
  }) => {
    test.setTimeout(240_000);
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('response', (response) => {
      if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`);
    });
    await mkdir(directory, { recursive: true });
    await installPad(page);
    await bootGame(page);
    await page.evaluate((legend) => window.__TEST__!.setLegend!(0, legend), legend);
    await expect
      .poll(() => page.evaluate(() => window.__TEST__!.getRightStickDebug!(0)?.legend))
      .toBe(legend);
    const rows = await page.evaluate(async () => {
      const seam = window.__TEST__!;
      const out: {
        context: string;
        visibleFacing: number;
        physicalAngle: number;
        expected: string;
        debug: RightStickSnapshot;
        forwardProjection: { x: number; z: number };
        renderedForward: { x: number; z: number };
      }[] = [];
      const frames = async (n = 2) => {
        for (let i = 0; i < n; i++)
          await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      };
      const reference = seam.getRightStickDebug!(0)!;
      // Camera target is the optical-axis point. Ground vectors projected here have
      // exactly the rendered camera heading, independent of perspective/lens shift.
      const origin: [number, number, number] = [9.5, 0, -0.5];
      const center = seam.project!(origin);
      const fiberPath = '/game/node_modules/.vite/deps/@react-three_fiber.js';
      const fiber = await import(fiberPath);
      const render = fiber._roots.get(document.querySelector('canvas')).store.getState();
      const angles = [
        0,
        45,
        90,
        135,
        180,
        225,
        270,
        315,
        ...Array.from({ length: 8 }, (_, i) => 22.5 + i * 45),
      ];
      for (const context of ['defense', 'offense'])
        for (let facingIndex = 0; facingIndex < 8; facingIndex++) {
          const visibleFacing = (facingIndex * Math.PI) / 4,
            sx = Math.cos(visibleFacing),
            sz = Math.sin(visibleFacing);
          const facing = reference.cameraYaw + Math.atan2(sx, -sz / reference.cameraPitchScale);
          for (const degrees of angles) {
            window.__relativeAxes = [0, 0, 0, 0];
            await seam.reset(42, 'live');
            seam.teleport('player', [origin[0], 0.95, origin[2]]);
            seam.teleport('opponent', [1, 0.95, 6]);
            if (context === 'defense') seam.teleport('ball', [0.5, 1, -6]);
            else seam.setHandling!(0, 'dribble', 1);
            seam.setFacing!(0, facing);
            await frames();
            const physicalAngle = (degrees * Math.PI) / 180;
            window.__relativeAxes = [0, 0, Math.cos(physicalAngle), -Math.sin(physicalAngle)];
            await frames(3);
            const debug = seam.getRightStickDebug!(0)!;
            const endpoint = seam.project!([
              origin[0] + Math.sin(facing),
              0,
              origin[2] + Math.cos(facing),
            ]);
            const forwardProjection = { x: endpoint.x - center.x, z: center.y - endpoint.y };
            const screenAngle = Math.atan2(forwardProjection.z, forwardProjection.x);
            const relative = Math.atan2(
              Math.sin(physicalAngle - screenAngle),
              Math.cos(physicalAngle - screenAngle),
            );
            // Exact diagonal boundaries prefer lateral.
            const kind =
              Math.abs(relative) < Math.PI / 4 - 1e-9
                ? 'front'
                : Math.abs(relative) > (3 * Math.PI) / 4 + 1e-9
                  ? 'behind'
                  : 'side';
            const side = relative > 0 ? 'left' : 'right';
            const expected =
              context === 'defense'
                ? kind === 'front'
                  ? 'up'
                  : kind === 'behind'
                    ? 'brace'
                    : side
                : kind;
            const floor = render.scene.getObjectByName('character-0');
            const lift = floor.children.find((o: { type: string }) => o.type === 'Group');
            const turn = lift.children.find((o: { type: string }) => o.type === 'Group');
            const rotation = turn.getWorldQuaternion(render.camera.quaternion.clone());
            const actual = render.camera.position.clone().set(0, 0, 1).applyQuaternion(rotation);
            const renderedForward = { x: actual.x, z: actual.z };
            if (debug.selected !== expected || debug.context !== context || debug.phase !== 'held')
              throw new Error(
                JSON.stringify({
                  context,
                  visibleFacing,
                  physicalAngle,
                  expected,
                  debug,
                  renderedForward,
                  forwardProjection,
                }),
              );
            out.push({
              context,
              visibleFacing,
              physicalAngle,
              expected,
              debug,
              forwardProjection,
              renderedForward,
            });
          }
        }
      window.__relativeAxes = [0, 0, 0, 0];
      return { reference, rows: out };
    });
    await writeFile(`${directory}/${legend}-direction-matrix.json`, JSON.stringify(rows, null, 2));
    expect(rows.reference.cameraYaw).toBeCloseTo(1.081877637475538, 8);
    expect(rows.reference.cameraPitchScale).toBeCloseTo(0.23783024978086562, 8);
    expect(rows.rows).toHaveLength(256);
    for (const row of rows.rows) {
      const where = `${legend} ${row.context} facing=${(row.visibleFacing * 180) / Math.PI} stick=${(row.physicalAngle * 180) / Math.PI}`;
      expect(row.debug.context, where).toBe(row.context);
      expect(row.renderedForward.x, where).toBeCloseTo(Math.sin(row.debug.bodyFacing), 6);
      expect(row.renderedForward.z, where).toBeCloseTo(Math.cos(row.debug.bodyFacing), 6);
      expect(row.debug.phase, where).toBe('held');
      expect(row.debug.selected, where).toBe(row.expected);
      expect(row.debug.rawAxes.axis2, where).toBeCloseTo(Math.cos(row.physicalAngle), 8);
      expect(row.debug.rawAxes.axis3, where).toBeCloseTo(-Math.sin(row.physicalAngle), 8);
      expect(Math.hypot(row.debug.normalized.x, row.debug.normalized.z), where).toBeCloseTo(1, 8);
      const length = Math.hypot(row.forwardProjection.x, row.forwardProjection.z);
      expect(row.debug.screenForward.x, where).toBeCloseTo(row.forwardProjection.x / length, 4);
      expect(row.debug.screenForward.z, where).toBeCloseTo(row.forwardProjection.z / length, 4);
    }
    expect(errors).toEqual([]);
  });

  test(`${legend}: held defense survives body/camera turns and a stick sweep; neutral and reconnect rearm the actual pad`, async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await installPad(page);
    await bootGame(page);
    await page.evaluate(async (legend) => {
      window.__TEST__!.setLegend!(0, legend);
      await window.__TEST__!.reset(42, 'live');
      window.__TEST__!.teleport('player', [6, 0.95, 0]);
      window.__TEST__!.teleport('opponent', [12, 0.95, -5]);
      window.__TEST__!.teleport('ball', [12, 1, -6]);
    }, legend);
    await expect
      .poll(() => page.evaluate(() => window.__TEST__!.getRightStickDebug!(0)?.legend))
      .toBe(legend);
    const proof = await page.evaluate(async () => {
      const seam = window.__TEST__!,
        frames = async (n = 3) => {
          for (let i = 0; i < n; i++)
            await new Promise<void>((r) => requestAnimationFrame(() => r()));
        };
      const yaw = seam.getRightStickDebug!(0)!.cameraYaw,
        initial = yaw + Math.PI / 2;
      seam.setFacing!(0, initial);
      window.__relativeAxes = [0, 0, 0, 0];
      await frames();
      window.__relativeAxes = [0, 0, 1, 0];
      await frames();
      const accepted = seam.getRightStickDebug!(0)!;
      const held = [];
      for (let i = 0; i < 8; i++) {
        seam.setFacing!(0, initial + (i * Math.PI) / 4);
        window.__relativeAxes = [0, 0, Math.cos((i * Math.PI) / 4), Math.sin((i * Math.PI) / 4)];
        await frames();
        held.push(seam.getRightStickDebug!(0)!);
      }
      seam.inspectCharacter!('side');
      await frames();
      held.push(seam.getRightStickDebug!(0)!);
      seam.inspectCharacter!(null);
      await frames();
      seam.setFacing!(0, initial + Math.PI);
      window.__relativeAxes = [0, 0, 0, 0];
      await frames();
      const neutral = seam.getRightStickDebug!(0)!;
      window.__relativeAxes = [0, 0, 1, 0];
      await frames();
      const next = seam.getRightStickDebug!(0)!;
      window.__relativeConnected = false;
      await frames();
      window.__relativeConnected = true;
      await frames();
      const reconnect = seam.getRightStickDebug!(0)!;
      window.__relativeAxes = [0, 0, 0, 0];
      await frames();
      window.__relativeAxes = [0, 0, 1, 0];
      await frames();
      const rearmed = seam.getRightStickDebug!(0)!;
      return { accepted, held, neutral, next, reconnect, rearmed };
    });
    expect(proof.accepted.selected).toBe('up');
    for (const frame of proof.held) {
      expect(frame.selected).toBe('up');
      expect(frame.lockedFacing).toBe(proof.accepted.lockedFacing);
    }
    expect(proof.neutral.selected).toBe('none');
    expect(proof.neutral.phase).toBe('armed');
    expect(proof.next.selected).toBe('brace');
    expect(proof.reconnect.selected).toBe('none');
    expect(proof.reconnect.phase).toBe('neutral-required');
    expect(proof.rearmed.selected).toBe('brace');
    await writeFile(`${directory}/${legend}-hold-proof.json`, JSON.stringify(proof, null, 2));
    await page.evaluate(() => window.__TEST__!.setDebugFlag('rightStick', true));
    await expect(page.getByTestId('right-stick-action')).toContainText('brace');
    await page.screenshot({ path: `${directory}/${legend}-debug-overlay.png` });
  });
}
