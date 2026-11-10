import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createMotionRecorder } from '../src/game/diagnostics/recorder.ts';
import { evaluateArmRules, evaluateReachRules } from '../src/game/diagnostics/rules.ts';
import { createDribbleSkillBuffer } from '../src/game/input/dribbleSkillBuffer.ts';
import { createDefensiveHandInput } from '../src/game/input/defensiveHands.ts';
import type { GestureAudit } from '../src/game/diagnostics/gestureAudit.ts';

function fixture(limits = {}) {
  let now = 0;
  const clock = { revision: 1, tick: 0, simulationTime: 0 };
  const recorder = createMotionRecorder({ now: () => now, limits });
  recorder.setClock(() => clock);
  recorder.context({ session: 'movement' }, { seed: 42 });
  return {
    recorder,
    clock,
    at: (ms: number) => {
      now = ms;
    },
  };
}
test('rolling recording retains native tick/sequence ordering independently of a UI', () => {
  const { recorder, clock, at } = fixture();
  for (let t = 0; t <= 35; t++) {
    at(t * 1000);
    clock.tick = t * 60;
    clock.simulationTime = t;
    recorder.event('input.button', { active: true }, { slot: 0 });
    recorder.sample('simulation', { ball: 'inactive' });
  }
  const trace = recorder.export(true);
  assert.equal(trace.events.length, 31);
  assert.ok(trace.events.every((e) => e.elapsedMs >= 5000));
  assert.equal(trace.events.at(-1)?.tick, 2100);
  assert.ok(trace.droppedEvents > 0);
  const all = [...trace.events, ...trace.samples].sort((a, b) => a.sequence - b.sequence);
  assert.equal(new Set(all.map((e) => e.sequence)).size, all.length);
  assert.equal(recorder.timeline(0, 2).length, 2);
});
test('explicit capture freezes on Stop while the recent buffer continues across resets', () => {
  const { recorder, clock, at } = fixture({ maxContexts: 2 });
  recorder.start();
  recorder.event('command.requested', {}, { action: 'defense_left' });
  recorder.sample('pose', { elbow: 12 });
  recorder.stop();
  const captured = recorder.export();
  for (let revision = 2; revision <= 5; revision++) {
    at(revision * 1000);
    clock.revision = revision;
    clock.tick = 0;
    clock.simulationTime = 0;
    recorder.context({ session: 'duel' }, { seed: revision });
    recorder.event('input.button');
  }
  assert.deepEqual(recorder.export().events, captured.events);
  assert.deepEqual(recorder.export().samples, captured.samples);
  assert.deepEqual(recorder.export().contexts, captured.contexts);
  assert.ok(recorder.export(true).events.some((e) => e.revision === 5));
  assert.ok(recorder.export(true).contexts.length <= 2);
});
test('capture auto-stops on duration even with the widget absent', () => {
  const { recorder, at } = fixture({ recordingSeconds: 1 });
  recorder.start();
  at(500);
  recorder.event('command.accepted');
  at(1500);
  recorder.event('outside-capture');
  assert.equal(recorder.status().state, 'stopped');
  assert.equal(recorder.status().stopReason, 'duration-limit');
  assert.ok(!recorder.export().events.some((e) => e.type === 'outside-capture'));
  assert.ok(recorder.export(true).events.some((e) => e.type === 'outside-capture'));
});
test('event/sample capacity is bounded and stops an explicit capture with a reason', () => {
  const { recorder } = fixture({ maxEvents: 4, maxSamples: 3 });
  recorder.start();
  for (let i = 0; i < 20; i++) {
    recorder.event('input');
    recorder.sample('pose', { i });
  }
  assert.equal(recorder.status().state, 'stopped');
  assert.equal(recorder.status().stopReason, 'capacity-limit');
  for (const trace of [recorder.export(), recorder.export(true)]) {
    assert.ok(trace.events.length <= 4);
    assert.ok(trace.samples.length <= 3);
  }
});
test('payloads are detached from mutable engine objects and nonfinite values are explicit JSON nulls', () => {
  const { recorder } = fixture();
  const source = { position: { x: 2 }, timer: -Infinity, error: NaN };
  recorder.sample('pose', source);
  source.position.x = 9;
  const data = recorder.export(true).samples[0].data;
  assert.deepEqual(data, { position: { x: 2 }, timer: null, error: null });
  (data as { position: { x: number } }).position.x = 80;
  assert.equal(
    (recorder.export(true).samples[0].data as { position: { x: number } }).position.x,
    2,
  );
});
test('resetting simulation time retains monotonic source time and distinguishes revisions', () => {
  const { recorder, clock, at } = fixture();
  at(400);
  clock.tick = 24;
  clock.simulationTime = 0.4;
  recorder.event('command.executed');
  at(500);
  clock.revision = 2;
  clock.tick = 0;
  clock.simulationTime = 0;
  recorder.context({ session: 'duel' }, { seed: 42 });
  const trace = recorder.export(true);
  assert.deepEqual(
    trace.events.map((e) => e.revision),
    [1, 1, 2],
  );
  assert.ok(trace.events[1].elapsedMs < trace.events[2].elapsedMs);
  assert.equal(trace.events[2].simulationTime, 0);
});
test('disabled production recorder captures no inputs or states', () => {
  const recorder = createMotionRecorder({ enabled: false });
  recorder.start();
  recorder.event('private-input');
  recorder.sample('pose', {});
  recorder.context({}, {});
  assert.equal(recorder.status().state, 'rolling');
  assert.equal(recorder.export().events.length, 0);
  assert.equal(recorder.export().samples.length, 0);
});
test('gesture audit reports the actual queue/reject/cancel policy without changing returned commands', () => {
  const events: GestureAudit[] = [];
  const buffer = createDribbleSkillBuffer(0, 1, 0.32, (e) => events.push(e));
  const sample = (extra = {}) =>
    buffer.sample({
      device: 'pad',
      version: 1,
      vector: { x: 0, z: 0 },
      hand: 0,
      facing: 0,
      enabled: true,
      eligible: true,
      crossing: false,
      time: 1,
      ...extra,
    });
  sample();
  sample({ vector: { x: 1, z: 0 } });
  assert.deepEqual(
    events.map((e) => e.stage),
    ['requested', 'queued'],
  );
  const command = buffer.take();
  assert.equal(command?.kind, 'side');
  assert.equal(command, events[0].gesture);
  sample();
  sample({ vector: { x: -1, z: 0 }, crossing: true });
  assert.equal(events.at(-1)?.stage, 'rejected');
  assert.equal(events.at(-1)?.reason, 'crossing-active');
  assert.equal(buffer.take(), null);
  sample();
  sample({ vector: { x: 1, z: 0 }, eligible: false, ineligibleReason: 'shot-charging' });
  assert.equal(events.at(-1)?.reason, 'shot-charging');
  sample();
  sample({ vector: { x: 1, z: 0 } });
  buffer.reset();
  assert.equal(events.at(-1)?.stage, 'cancelled');
  assert.equal(buffer.take(), null);
});
test('defensive audit correlates accepted body-relative hands and distinguishes a double rear push', () => {
  const events: GestureAudit[] = [];
  const buffer = createDefensiveHandInput(0.32, (e) => events.push(e));
  const sample = (time: number, vector = { x: 0, z: 0 }) =>
    buffer.sample({
      time,
      vector,
      device: 'pad',
      version: 1,
      enabled: true,
      facing: 0,
      cameraAngle: 0,
      verticalScale: 1,
    });
  sample(1);
  assert.equal(sample(1.1, { x: 1, z: 0 }), 'left');
  assert.equal(events.at(-1)?.action, 'defense_left');
  sample(2);
  sample(2.05, { x: 0, z: 1 });
  sample(2.1);
  sample(2.15, { x: 0, z: 1 });
  assert.equal(events.at(-1)?.action, 'defense_push');
  assert.notEqual(buffer.takePush(2.16), null);
});
test('measured anatomy thresholds ignore unsettled blending and report exact units/limits', () => {
  const arm = {
    weight: 1,
    elbowFlex: 12,
    wristBend: 20,
    elbowPlaneError: 0.05,
    contactError: 0.001,
  };
  assert.deepEqual(evaluateArmRules([arm]), []);
  assert.deepEqual(evaluateArmRules([{ ...arm, weight: 0.2, elbowFlex: 160 }]), []);
  const result = evaluateArmRules([{ ...arm, elbowFlex: 160, contactError: 0.1 }]);
  assert.deepEqual(
    result.map((r) => r.rule),
    ['DEF-ELBOW-RANGE', 'DEF-PALM-TARGET'],
  );
  assert.equal(result[1].unit, 'meters');
  assert.equal(evaluateArmRules([{ ...arm, elbowFlex: NaN }])[0].rule, 'POSE-NONFINITE');
});

test('DEF-ARM-001 checks measured lateral hand, palm and opposite guarding arm instead of trusting a pose label', () => {
  const left = {
    weight: 1,
    elbowFlex: 12,
    wristBend: 20,
    elbowPlaneError: 0,
    contactError: 0,
    shoulder: { x: 0, z: 0 },
    wrist: { x: 0.6, z: 0 },
    upperLength: 0.3,
    foreLength: 0.3,
  };
  const right = { ...left, elbowFlex: 95 };
  assert.deepEqual(
    evaluateReachRules(
      'left',
      0,
      [left, right],
      [
        { x: 0, z: 1 },
        { x: 1, z: 0 },
      ],
    ),
    [],
  );
  const bad = evaluateReachRules(
    'left',
    0,
    [
      { ...left, wrist: { x: -0.6, z: 0 } },
      { ...right, elbowFlex: 5 },
    ],
    [
      { x: 0, z: -1 },
      { x: 1, z: 0 },
    ],
  );
  assert.deepEqual(
    bad.map((w) => w.rule),
    ['DEF-ARM-001-SIDE', 'DEF-ARM-001-PALM', 'DEF-ARM-001-GUARD'],
  );
});

test('Record checkpoints the current runtime, rather than pretending the session-start state is the capture start', () => {
  const { recorder, clock, at } = fixture();
  at(5000);
  clock.tick = 300;
  clock.simulationTime = 5;
  recorder.setCheckpoint(() => ({ x: 9, currentSeed: 123 }));
  recorder.start();
  const checkpoint = recorder.export().samples.find((s) => s.channel === 'checkpoint')!;
  assert.equal(checkpoint.tick, 300);
  assert.deepEqual(checkpoint.data, { x: 9, currentSeed: 123 });
});

test('finite checks accept extra vector/boolean fields carried by the real IK debug structure', () => {
  const realShape = {
    weight: 1,
    elbowFlex: 12,
    wristBend: 10,
    elbowPlaneError: 0.05,
    contactError: 0.001,
    shoulder: { x: 1, y: 2, z: 0 },
    poleFallback: false,
  };
  assert.deepEqual(evaluateArmRules([realShape]), []);
});
