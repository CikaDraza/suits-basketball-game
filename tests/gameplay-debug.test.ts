import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createGameplayCommands,
  matchesGameplayPose,
} from '../src/game/diagnostics/gameplayCommands';
import { createMotionRecorder } from '../src/game/diagnostics/recorder';
import { createDuelState } from '../src/game/simulation/runtime';
import type { AnimationObservation } from '../src/game/diagnostics/motionAudit';

test('command projection keeps acceptance, actual execution and pose evidence separate, bounded and detached per player/revision', () => {
  const commands = createGameplayCommands(2);
  const recorder = createMotionRecorder({ onEvent: commands.observe });
  const clock = { revision: 1, tick: 0, simulationTime: 0 };
  recorder.setClock(() => clock);
  const id = recorder.event('command.requested', {}, { slot: 0, action: 'stance_or_special' });
  recorder.event('command.accepted', {}, { slot: 0, commandId: id });
  assert.equal(commands.view(0)[0].execution, null, 'accepted must not imply executed');
  assert.equal(commands.view(0)[0].observation, null);
  recorder.event('command.executed', { mode: 'post' }, { slot: 0, commandId: id });
  assert.equal(commands.view(0)[0].decision!.stage, 'accepted');
  assert.equal(commands.view(0)[0].observation, null, 'state change must not imply final pose');
  const pose = { mode: 'post', layers: { torso: 'imported-defense' } };
  recorder.event('animation.active', pose, { slot: 0, commandId: id });
  pose.layers.torso = 'changed';
  assert.equal(
    (commands.view(0)[0].observation!.data.layers as { torso: string }).torso,
    'imported-defense',
  );
  recorder.event('command.requested', {}, { slot: 1, action: 'move' });
  assert.equal(commands.view(1).length, 1);
  for (let i = 0; i < 3; i++) recorder.event('command.requested', {}, { slot: 0, action: 'move' });
  assert.equal(commands.view(0).length, 2);
  clock.revision = 2;
  recorder.event('session.begin');
  recorder.event('command.executed', { mode: 'post' }, { slot: 0, commandId: id });
  assert.deepEqual(commands.view(0), []);
  assert.deepEqual(commands.view(1), []);
});

test('rejection, cancellation, newer requests and ended movement prevent stale pose correlation', () => {
  const commands = createGameplayCommands();
  const recorder = createMotionRecorder({ onEvent: commands.observe });
  const request = () => recorder.event('command.requested', {}, { slot: 0, action: 'move' });
  const id = request();
  recorder.event('command.executed', {}, { slot: 0, commandId: id });
  assert.equal(commands.pending(0).length, 1);
  recorder.event('command.ended', {}, { slot: 0, commandId: id });
  assert.equal(commands.pending(0).length, 0);
  const next = request();
  recorder.event('command.executed', {}, { slot: 0, commandId: next });
  recorder.event('command.rejected', {}, { slot: 0, commandId: next, reason: 'mode-down' });
  assert.equal(commands.pending(0).length, 0);
  const valid = request();
  recorder.event('command.executed', {}, { slot: 0, commandId: valid });
  request();
  assert.equal(commands.pending(0).length, 0, 'new request supersedes old same-action correlation');
});

test('pose matching requires the final active owner, measured movement and actual state', () => {
  const commands = createGameplayCommands();
  const recorder = createMotionRecorder({ onEvent: commands.observe });
  const state = createDuelState(['shaq', 'chuck'], 42, 1, 'live');
  const id = recorder.event('command.requested', {}, { slot: 0, action: 'defense_left' });
  const pose: AnimationObservation = {
    mode: 'idle',
    defense: 'left',
    phase: { remaining: 0, push: 0, ball: 0 },
    layers: { arms: 'ball-hand-ik' },
    locomotion: null,
  };
  assert.equal(matchesGameplayPose(commands.view(0)[0], pose, state), false);
  recorder.event('command.executed', {}, { slot: 0, commandId: id });
  assert.equal(
    matchesGameplayPose(commands.view(0)[0], pose, state),
    false,
    'a pose label with ball IK is not defensive arm execution',
  );
  pose.layers.arms = 'defensive-arm-ik';
  assert.equal(matchesGameplayPose(commands.view(0)[0], pose, state), true);
  const shot = recorder.event('command.requested', {}, { slot: 0, action: 'shoot_charge' });
  recorder.event('command.executed', {}, { slot: 0, commandId: shot });
  pose.layers.arms = 'ball-hand-ik';
  assert.equal(matchesGameplayPose(commands.view(0)[0], pose, state), false);
  state.players[0].charge = 0.5;
  assert.equal(matchesGameplayPose(commands.view(0)[0], pose, state), true);
  state.owner = -1;
  assert.equal(matchesGameplayPose(commands.view(0)[0], pose, state), false);
});

test('disabled production recorder never invokes its projection', () => {
  let observed = 0;
  const recorder = createMotionRecorder({ enabled: false, onEvent: () => observed++ });
  recorder.event('command.requested', {}, { slot: 0, action: 'move' });
  assert.equal(observed, 0);
});
