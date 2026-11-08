import assert from 'node:assert/strict';
import test from 'node:test';
import { config } from '../src/game/data/gameConfig';
import { createDribbleSkillBuffer } from '../src/game/input/dribbleSkillBuffer';
import { createMovementTransform } from '../src/game/simulation/coordinates';

const movement = createMovementTransform(config.camera.inputAngle);
const direction = movement.stickToWorld(1, 0);
const facing = Math.atan2(direction.x, direction.z);
const rise = config.camera.height - config.camera.target[1];
const pitchScale = rise / Math.hypot(config.camera.horizontalDistance, rise);
type Sample = Parameters<ReturnType<typeof createDribbleSkillBuffer>['sample']>[0];
const base: Sample = {
  device: 'pad-0',
  version: 0,
  vector: { x: 0, z: 0 },
  hand: 0,
  facing,
  enabled: true,
  eligible: true,
  crossing: false,
};
function fixture() {
  const buffer = createDribbleSkillBuffer(config.camera.inputAngle, pitchScale);
  const sample = (partial: Partial<Sample> = {}) => buffer.sample({ ...base, ...partial });
  sample();
  return { buffer, sample };
}

test('a short observed skill deflection and release before the next physics tick survives once', () => {
  const { buffer, sample } = fixture();
  sample({ vector: { x: 0, z: -1 } });
  sample(); // A 120 Hz render sample can see release before the 60 Hz physics consumer.
  assert.equal(buffer.debug.pending, 1);
  assert.equal(buffer.take()?.hand, -1);
  assert.equal(buffer.debug.pending, 0);
  assert.equal(buffer.take(), null, 'the observed command has exactly one consumer');
});

test('holding a skill direction through a turn never repeats or reverses its accepted command', () => {
  for (const rate of [20, 30, 60, 120]) {
    const { buffer, sample } = fixture();
    sample({ vector: { x: 0, z: -1 } });
    const command = buffer.take();
    assert.equal(command?.hand, -1);
    assert.equal(command?.facing, facing);
    for (let n = 0; n < rate; n++) {
      sample({ vector: { x: 0, z: -1 }, facing: facing + (n / rate) * Math.PI });
      assert.equal(buffer.take(), null, `@${rate} held sample ${n}`);
    }
    assert.equal(buffer.debug.activations, 1);
    sample();
    sample({ vector: { x: 0, z: 1 } });
    assert.equal(buffer.take()?.hand, 1, 'neutral rearms a deliberate opposite-side gesture');
  }
});

test('the event keeps the activation orientation while waiting for physics', () => {
  const { buffer, sample } = fixture();
  sample({ vector: { x: 0, z: -1 } });
  sample({ vector: { x: 0, z: -1 }, facing: facing + Math.PI });
  sample({ facing: facing + Math.PI });
  assert.deepEqual(buffer.take(), { hand: -1, facing, sequence: 1 });
});

test('a committed crossover rejects new input and never replays it on completion', () => {
  const { buffer, sample } = fixture();
  sample({ vector: { x: 0, z: -1 }, crossing: true });
  assert.equal(buffer.take(), null);
  assert.equal(buffer.debug.rejected, 1);
  sample({ vector: { x: 0, z: -1 }, crossing: false });
  assert.equal(buffer.take(), null, 'holding the rejected direction does not queue it later');
  sample();
  sample({ vector: { x: 0, z: 1 } });
  assert.equal(buffer.take()?.hand, 1, 'a fresh post-recovery gesture is accepted');
});

test('starting a crossover discards an older unconsumed request instead of deferring it', () => {
  const { buffer, sample } = fixture();
  sample({ vector: { x: 0, z: -1 } });
  assert.equal(buffer.debug.pending, 1);
  sample({ crossing: true });
  assert.equal(buffer.take(), null);
  sample({ crossing: false });
  assert.equal(buffer.take(), null, 'cross recovery never resurrects the old request');
});

test('only the latest request is retained before any crossover has committed', () => {
  const { buffer, sample } = fixture();
  sample({ vector: { x: 0, z: -1 } });
  sample();
  sample({ vector: { x: 0, z: 1 } });
  assert.equal(buffer.debug.activations, 2);
  assert.equal(buffer.debug.pending, 1);
  assert.deepEqual(buffer.take(), { hand: 1, facing, sequence: 2 });
  assert.equal(buffer.take(), null, 'the older uncommitted request was replaced');
});

test('explicit anatomical buttons are edge-triggered independently from the directional skill gesture', () => {
  const { buffer, sample } = fixture();
  sample({ hand: 1 });
  sample({ hand: 0 });
  assert.equal(buffer.take()?.hand, 1, 'a short direct button tap survives release');
  sample({ hand: -1 });
  assert.equal(buffer.take()?.hand, -1);
  for (let n = 0; n < 10; n++) {
    sample({ hand: -1, facing: facing + Math.PI });
    assert.equal(buffer.take(), null, 'held anatomical hand button does not repeat');
  }
  sample({ hand: 0 });
  sample({ hand: 1, crossing: true });
  assert.equal(buffer.take(), null, 'committed cross also rejects direct hand commands');
  sample({ hand: 1 });
  assert.equal(buffer.take(), null, 'rejected direct button is not replayed after cross');
});

test('losing eligibility drops unconsumed requests and does not accept a held gesture on regaining possession', () => {
  const { buffer, sample } = fixture();
  sample({ vector: { x: 0, z: -1 } });
  sample({ vector: { x: 0, z: -1 }, eligible: false });
  assert.equal(buffer.take(), null);
  sample({ vector: { x: 0, z: -1 } });
  assert.equal(buffer.take(), null);
  sample();
  sample({ vector: { x: 0, z: 1 } });
  assert.equal(buffer.take()?.hand, 1);
});

test('pause, reset and disconnect clear pending commands and rearm only after neutral', () => {
  for (const lifecycle of ['pause', 'reset', 'disconnect'] as const) {
    const { buffer, sample } = fixture();
    sample({ vector: { x: 0, z: -1 } });
    const next =
      lifecycle === 'reset'
        ? { version: 1 }
        : lifecycle === 'disconnect'
          ? { device: 'pad-1' }
          : {};
    if (lifecycle === 'disconnect') sample({ device: null, enabled: false });
    sample({ ...next, enabled: false, vector: { x: 0, z: -1 } });
    assert.equal(buffer.take(), null, `${lifecycle}: pending input cleared`);
    sample({ ...next, vector: { x: 0, z: -1 } });
    assert.equal(buffer.take(), null, `${lifecycle}: held gesture is not restored`);
    sample(next);
    sample({ ...next, vector: { x: 0, z: 1 } });
    assert.equal(buffer.take()?.hand, 1, `${lifecycle}: fresh gesture after neutral`);
  }
});

test('direct hand buttons also require a neutral sample after start, pause, reset and reconnect', () => {
  for (const lifecycle of ['start', 'pause', 'reset', 'disconnect'] as const) {
    const buffer = createDribbleSkillBuffer(config.camera.inputAngle, pitchScale);
    const sample = (partial: Partial<Sample> = {}) => buffer.sample({ ...base, ...partial });
    if (lifecycle !== 'start') {
      sample();
      sample({ hand: 1 });
      assert.equal(buffer.take()?.hand, 1);
    }
    const next =
      lifecycle === 'reset'
        ? { version: 1 }
        : lifecycle === 'disconnect'
          ? { device: 'pad-1' }
          : {};
    if (lifecycle === 'disconnect') sample({ device: null, enabled: false });
    if (lifecycle === 'pause') sample({ enabled: false, hand: -1 });
    sample({ ...next, hand: -1 });
    assert.equal(buffer.take(), null, `${lifecycle}: held direct button stays disarmed`);
    sample(next);
    sample({ ...next, hand: -1 });
    assert.equal(
      buffer.take()?.hand,
      -1,
      `${lifecycle}: neutral release rearms the direct command`,
    );
  }
});
