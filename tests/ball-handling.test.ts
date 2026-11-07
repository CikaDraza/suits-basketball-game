import assert from 'node:assert/strict';
import test from 'node:test';
import { config } from '../src/game/data/gameConfig';
import {
  createBallHandlingState,
  dribbleHeight,
  stepBallHandling,
  localToCourt,
  courtToLocal,
} from '../src/game/simulation/ballHandling';
const body = { x: 3, y: 0.92, z: 2 };
test('explicit body/court conversions roundtrip and floor contact stays one radius above court', () => {
  const local = { x: 0.4, y: 1.3, z: 0.3 },
    world = { x: 0, y: 0, z: 0 },
    back = { x: 0, y: 0, z: 0 };
  for (const angle of [0, 1, Math.PI, -2]) {
    localToCourt(local, body, angle, world);
    courtToLocal(world, body, angle, back);
    for (const k of ['x', 'y', 'z'] as const) assert.ok(Math.abs(local[k] - back[k]) < 1e-8);
  }
  assert.equal(dribbleHeight(0.5, 1.2, 0.13), 0.13);
  assert.equal(dribbleHeight(0, 1.2, 0.13), 1.2);
});
test('controlled hold/dribble/crossover is continuous and deterministic at 30/60/120 steps per second', () => {
  const finals = [];
  for (const rate of [30, 60, 120]) {
    const state = createBallHandlingState();
    let current = { x: 3, y: 1.4, z: 2.3 },
      maximumJump = 0;
    let sawCross = false,
      sawFloor = false;
    for (let i = 0; i < rate * 4; i++) {
      const t = i / rate,
        hand = t > 1.2 ? -1 : 1,
        mode = t < 0.3 ? 'hold' : 'dribble';
      const previous = { ...current };
      current = {
        ...stepBallHandling(state, 0, 'shaq', body, 0.3, mode, hand, false, 0, current, 1 / rate),
      };
      maximumJump = Math.max(
        maximumJump,
        Math.hypot(current.x - previous.x, current.y - previous.y, current.z - previous.z),
      );
      assert.ok(current.y >= config.ball.radius - 1e-8);
      sawCross ||= state.crossing;
      sawFloor ||= Math.abs(current.y - config.ball.radius) < 1e-5;
    }
    assert.ok(sawCross && sawFloor);
    assert.equal(state.hand, -1);
    assert.ok(maximumJump < 0.28, `Jump at ${rate}Hz: ${maximumJump}`);
    finals.push(current);
  }
  for (const p of finals)
    assert.ok(Math.hypot(p.x - finals[0].x, p.y - finals[0].y, p.z - finals[0].z) < 0.08);
});
