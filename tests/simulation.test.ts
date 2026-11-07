import assert from 'node:assert/strict';
import { test } from 'node:test';
import { config, level } from '../src/game/data/gameConfig.ts';
import { createMovementTransform } from '../src/game/simulation/coordinates.ts';
import { createHudSnapshot } from '../src/game/simulation/hudSnapshot.ts';
import { createDuelState } from '../src/game/simulation/runtime.ts';
import { createInitialHudSnapshot } from '../src/game/state/gameStore.ts';

const settings = {
  exhaustedThreshold: config.player.exhaustedThreshold,
  jabTapWindow: config.handling.jabTapWindow,
};

function close(actual: number, expected: number) {
  assert.ok(Math.abs(actual - expected) < 1e-12, `${actual} should equal ${expected}`);
}

test('camera-relative movement roundtrips to the same normalized stick direction', () => {
  for (const angle of [0, Math.PI / 2, Math.PI, -0.75, config.camera.inputAngle]) {
    const movement = createMovementTransform(angle);
    for (const [x, z] of [
      [1, 0],
      [0, 1],
      [-1, -1],
      [0.3, -0.8],
    ]) {
      const world = movement.stickToWorld(x, z);
      const stick = movement.worldToStick(world.x, world.z);
      const magnitude = Math.hypot(x, z);
      close(Math.hypot(world.x, world.z), magnitude);
      close(stick.x, x / magnitude);
      close(stick.z, z / magnitude);
      close(Math.hypot(stick.x, stick.z), 1);
    }
  }
});

test('camera-relative forward points away from the viewer and respects the deadzone', () => {
  const movement = createMovementTransform(0);
  close(movement.stickToWorld(0, 1).z, -1);
  assert.deepEqual(movement.worldToStick(0, 0), { x: 0, z: 0 });
  assert.deepEqual(movement.worldToStick(0.3, 0.4, 0.5), { x: 0, z: 0 });
  close(Math.hypot(...Object.values(movement.worldToStick(0.3, 0.4, 0.49))), 1);
});

test('an idle simulation reuses the complete HUD snapshot', () => {
  const runtime = createDuelState(['shaq', 'chuck']);
  const previous = createInitialHudSnapshot();
  assert.equal(createHudSnapshot(runtime, previous, settings), previous);
  runtime.time = config.effects.textDuration / 2;
  runtime.players[0].aiClock = 12;
  assert.equal(createHudSnapshot(runtime, previous, settings), previous);
});

test('shot charging preserves unrelated HUD tuple references', () => {
  const runtime = createDuelState(['shaq', 'chuck']);
  const previous = createInitialHudSnapshot();
  runtime.players[0].charge = config.shots.perfectTime;
  const snapshot = createHudSnapshot(runtime, previous, settings);
  assert.notEqual(snapshot, previous);
  assert.equal(snapshot.charge, config.shots.perfectTime);
  assert.equal(previous.charge, 0);
  assert.equal(snapshot.energies, previous.energies);
  assert.equal(snapshot.modes, previous.modes);
  assert.equal(snapshot.handling, previous.handling);
  assert.equal(createHudSnapshot(runtime, snapshot, settings), snapshot);
});

test('changing energy replaces only the changed tuple and never leaks mutable runtime data', () => {
  const runtime = createDuelState(['shaq', 'chuck']);
  const previous = createInitialHudSnapshot();
  runtime.players[0].energy = 40;
  const snapshot = createHudSnapshot(runtime, previous, settings);
  assert.notEqual(snapshot.energies, previous.energies);
  assert.deepEqual(snapshot.energies, [40, config.player.energyMax]);
  assert.equal(snapshot.modes, previous.modes);
  assert.equal(snapshot.handling, previous.handling);
  runtime.players[0].energy = 1;
  runtime.players[0].handling = 'dribble';
  runtime.score[0] = 3;
  assert.deepEqual(snapshot.energies, [40, config.player.energyMax]);
  assert.equal(snapshot.handling[0], 'hold');
  assert.equal(snapshot.score, 0);
  assert.equal(previous.energies[0], config.player.energyMax);
});

test('inbound HUD snapshots are detached, reused when unchanged, and replaced at stage transitions', () => {
  const runtime = createDuelState(['shaq', 'chuck']);
  runtime.ballState = 'inbound';
  runtime.owner = -1;
  runtime.inboundOwner = 1;
  runtime.inboundClock = 4;
  const positioning = createHudSnapshot(runtime, createInitialHudSnapshot(), settings);
  assert.equal(positioning.phase, 'INBOUND_PHASE');
  assert.deepEqual(positioning.inbound, { stage: 'POSITIONING', remaining: 4, owner: 1 });
  assert.deepEqual(positioning.handling, ['none', 'none']);
  assert.equal(createHudSnapshot(runtime, positioning, settings), positioning);

  runtime.inboundStage = 'pass';
  runtime.inboundClock = -0.1;
  const passing = createHudSnapshot(runtime, positioning, settings);
  assert.notEqual(passing.inbound, positioning.inbound);
  assert.deepEqual(passing.inbound, { stage: 'PASS_WINDOW', remaining: 0, owner: 1 });
  assert.equal(positioning.inbound?.remaining, 4);
  assert.equal(passing.energies, positioning.energies);
});

test('HUD-only derived values leave simulation mode unchanged', () => {
  const runtime = createDuelState(['shaq', 'chuck']);
  runtime.players[0].energy = settings.exhaustedThreshold - 1;
  runtime.players[0].dirHeld = settings.jabTapWindow * 2;
  runtime.time = runtime.messageUntil;
  const snapshot = createHudSnapshot(runtime, createInitialHudSnapshot(), settings);
  assert.equal(snapshot.modes[0], 'exhausted');
  assert.equal(runtime.players[0].mode, 'idle');
  assert.equal(snapshot.holdProgress, 1);
  assert.equal(snapshot.message, '');
});

test('a new duel restores transient state and owns fresh nested objects', () => {
  const previous = createDuelState(['shaq', 'chuck'], 7, 2);
  previous.ballState = 'inbound';
  previous.inboundClock = 1;
  previous.inboundStage = 'pass';
  previous.flight.dunk = true;
  previous.flight.t = 20;
  previous.ball.y = -10;
  previous.players[0].grip.ok = true;
  previous.players[0].energy = 0;
  previous.score[0] = config.score.winTarget;
  previous.event.t = 12;

  const next = createDuelState(['chuck', 'shaq'], 123, 4);
  assert.equal(next.seed, 123);
  assert.equal(next.revision, 4);
  assert.deepEqual(
    next.players.map((player) => player.legend),
    ['chuck', 'shaq'],
  );
  assert.equal(next.players[0].energy, config.player.energyMax);
  assert.equal(next.players[0].grip.ok, false);
  assert.equal(next.ballState, 'held');
  assert.equal(next.ball.y, config.ball.holdHeight);
  assert.equal(next.ball.x, level.spawns[level.initialOwner].x);
  assert.deepEqual(next.score, [0, 0]);
  assert.equal(next.flight.dunk, false);
  assert.equal(next.flight.t, 0);
  assert.equal(next.inboundClock, 0);
  assert.equal(next.inboundStage, 'position');
  assert.equal(next.event.t, -10);
  assert.notEqual(next.players, previous.players);
  assert.notEqual(next.players[0], previous.players[0]);
  assert.notEqual(next.players[0].grip, previous.players[0].grip);
  assert.notEqual(next.ball, previous.ball);
  assert.notEqual(next.flight, previous.flight);
  assert.notEqual(next.score, previous.score);
  assert.notEqual(next.event, previous.event);
});
