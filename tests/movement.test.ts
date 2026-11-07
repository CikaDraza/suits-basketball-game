import assert from 'node:assert/strict';
import test from 'node:test';
import { approachVelocity } from '../src/game/simulation/movement';
import { config } from '../src/game/data/gameConfig';

const { accelTime, brakeTime } = config.movement;
const TOP = 2.65;

function simulate(
  rate: number,
  seconds: number,
  from: { x: number; z: number },
  to: { x: number; z: number },
) {
  const v = { ...from },
    samples: { t: number; x: number; z: number }[] = [];
  for (let i = 1; i <= Math.round(seconds * rate); i++) {
    approachVelocity(v, to, TOP, accelTime, brakeTime, 1 / rate, v);
    samples.push({ t: i / rate, x: v.x, z: v.z });
  }
  return samples;
}
/** first sample at or after time t */
const after = (s: { t: number; x: number; z: number }[], t: number) =>
  s.find((p) => p.t >= t - 1e-9)!;
const at = (s: { t: number; x: number; z: number }[], t: number) =>
  s.reduce((best, p) => (Math.abs(p.t - t) < Math.abs(best.t - t) ? p : best));

test('heavy start: ~0.4 s to top speed, half way at 0.2 s, identical at 30/60/120 steps per second', () => {
  assert.equal(accelTime, 0.4);
  for (const rate of [30, 60, 120]) {
    const s = simulate(rate, 0.8, { x: 0, z: 0 }, { x: TOP, z: 0 });
    assert.ok(Math.abs(at(s, 0.2).x - TOP / 2) < 0.02, `@${rate}: ${at(s, 0.2).x} at 0.2 s`);
    assert.ok(at(s, 0.39).x < TOP, 'reached top speed early');
    assert.ok(Math.abs(after(s, 0.4).x - TOP) < 1e-9, 'not at top speed after accelTime');
    assert.ok(
      s.every((p) => p.x <= TOP + 1e-12),
      'overshoot',
    );
  }
});

test('braking takes brakeTime and a reversal passes through zero instead of flipping', () => {
  for (const rate of [30, 60, 120]) {
    const stop = simulate(rate, 0.6, { x: TOP, z: 0 }, { x: 0, z: 0 });
    assert.ok(Math.abs(after(stop, brakeTime).x) < 1e-9);
    assert.ok(at(stop, brakeTime / 2).x > TOP * 0.45);
    const flip = simulate(rate, 1, { x: TOP, z: 0 }, { x: -TOP, z: 0 });
    const zero = flip.findIndex((p) => p.x <= 0);
    assert.ok(zero / rate > brakeTime * 0.9, `reversed too fast at ${rate} Hz`);
    assert.ok(Math.abs(flip.at(-1)!.x + TOP) < 1e-9, 'did not finish the reversal');
  }
});

test('a sideways change of direction is rate-limited along the velocity difference', () => {
  const s = simulate(60, 0.1, { x: TOP, z: 0 }, { x: 0, z: TOP });
  const first = s[0];
  // one 1/60 s step moves the velocity by at most rate·dt along the difference vector
  const moved = Math.hypot(first.x - TOP, first.z);
  assert.ok(moved <= TOP / Math.min(accelTime, brakeTime) / 60 + 1e-9);
});
