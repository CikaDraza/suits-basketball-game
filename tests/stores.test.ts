import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { config, level } from '../src/game/data/gameConfig.ts';
import { useGameStore } from '../src/game/state/gameStore.ts';
import { useInputStore } from '../src/game/state/inputStore.ts';

beforeEach(() => {
  useGameStore.setState(useGameStore.getInitialState(), true);
  useInputStore.setState(useInputStore.getInitialState(), true);
});

test('duplicate input writes and an empty flush do not notify subscribers', () => {
  let notifications = 0;
  const unsubscribe = useInputStore.subscribe(() => {
    notifications++;
  });
  try {
    const input = useInputStore.getState();
    input.setAxis(0, 0);
    input.setAction('actionA', false);
    input.flush();
    assert.equal(notifications, 0);
    assert.equal(useInputStore.getState(), input);
    input.setAxis(0.5, -0.25);
    input.setAxis(0.5, -0.25);
    input.setAction('actionA', true);
    input.setAction('actionA', true);
    assert.equal(notifications, 2);
    input.flush();
    input.flush();
    assert.equal(notifications, 3);
  } finally {
    unsubscribe();
  }
});

test('input axes remain finite and bounded without discarding valid analog precision', () => {
  const input = useInputStore.getState();
  input.setAxis(10, -10);
  assert.equal(useInputStore.getState().moveX, 1);
  assert.equal(useInputStore.getState().moveZ, -1);
  input.setAxis(Number.NaN, Number.POSITIVE_INFINITY);
  assert.equal(useInputStore.getState().moveX, 0);
  assert.equal(useInputStore.getState().moveZ, 0);
  input.setAxis(Number.NEGATIVE_INFINITY, 0.125);
  assert.equal(useInputStore.getState().moveX, 0);
  assert.equal(useInputStore.getState().moveZ, 0.125);
});

test('game reset immediately clears the full HUD and input while retaining matchup and sound', () => {
  const actions = useGameStore.getState();
  actions.choose(0, 'chuck');
  actions.toggleSound();
  const legends = useGameStore.getState().legends;
  useGameStore.setState({
    screen: 'gameover',
    score: 2,
    cpuScore: 7,
    finalScore: 2,
    energies: [1, 2],
    modes: ['down', 'stun'],
    owner: -1,
    ballState: 'inbound',
    phase: 'INBOUND_PHASE',
    inbound: { stage: 'PASS_WINDOW', remaining: 1, owner: 1 },
    handling: ['none', 'none'],
    charge: 1,
    holdProgress: 1,
    health: 10,
    maxHealth: 125,
    lives: 0,
    level: 3,
    cpu: false,
  });
  const previous = useGameStore.getState();
  useInputStore.getState().setAxis(1, -1);
  useInputStore.getState().setAction('actionB', true);
  actions.reset();

  const next = useGameStore.getState();
  assert.equal(next.screen, 'playing');
  assert.equal(next.score, 0);
  assert.equal(next.cpuScore, 0);
  assert.equal(next.finalScore, 0);
  assert.equal(next.owner, -1);
  assert.equal(next.ballState, 'inbound');
  assert.equal(next.phase, 'INBOUND_PHASE');
  assert.deepEqual(next.inbound, {
    stage: 'POSITIONING',
    remaining: config.inbound.positionTime,
    owner: level.initialOwner,
  });
  assert.equal(next.charge, 0);
  assert.equal(next.holdProgress, 0);
  assert.equal(next.health, 125);
  assert.equal(next.lives, 1);
  assert.equal(next.level, 1);
  assert.equal(next.cpu, true);
  assert.deepEqual(next.energies, [config.player.energyMax, config.player.energyMax]);
  assert.deepEqual(next.modes, ['idle', 'idle']);
  assert.deepEqual(next.handling, ['none', 'none']);
  assert.equal(next.revision, previous.revision + 1);
  assert.equal(next.legends, legends);
  assert.equal(next.sound, false);
  assert.equal(next.reset, actions.reset);
  assert.notEqual(next.energies, previous.energies);
  assert.equal(previous.charge, 1);
  assert.equal(useInputStore.getState().moveX, 0);
  assert.equal(useInputStore.getState().moveZ, 0);
  assert.equal(useInputStore.getState().actionB, false);
});

test('duplicate screen and roster choices do not notify or advance the simulation revision', () => {
  let notifications = 0;
  const unsubscribe = useGameStore.subscribe(() => {
    notifications++;
  });
  try {
    const game = useGameStore.getState();
    game.setScreen('playing');
    game.resume();
    game.choose(0, game.legends[0]);
    game.choose(-1, 'chuck');
    game.choose(2, 'shaq');
    game.choose(Number.NaN, 'shaq');
    assert.equal(notifications, 0);
    assert.equal(useGameStore.getState(), game);
    game.choose(0, 'chuck');
    const selected = useGameStore.getState();
    assert.equal(notifications, 1);
    assert.equal(selected.revision, game.revision + 1);
    assert.notEqual(selected.legends, game.legends);
    assert.deepEqual(game.legends, ['shaq', 'chuck']);
  } finally {
    unsubscribe();
  }
});

test('pause and resume flush held controls and ignore invalid terminal transitions', () => {
  const game = useGameStore.getState();
  useInputStore.getState().setAction('actionA', true);
  game.pause();
  assert.equal(useGameStore.getState().screen, 'paused');
  assert.equal(useInputStore.getState().actionA, false);
  useInputStore.getState().setAxis(1, 1);
  game.resume();
  assert.equal(useGameStore.getState().screen, 'playing');
  assert.equal(useInputStore.getState().moveX, 0);
  for (const screen of ['win', 'gameover'] as const) {
    game.setScreen(screen);
    const terminal = useGameStore.getState();
    game.pause();
    game.resume();
    assert.equal(useGameStore.getState(), terminal);
  }
  game.setScreen('paused');
  assert.equal(useGameStore.getState().screen, 'paused');
});

test('inbound requests are owned intents, gated by screen/possession and cleared on reset', () => {
  useGameStore.setState({ phase: 'LIVE', inbound: null, owner: 0, ballState: 'held' });
  const game = useGameStore.getState();
  game.requestInboundPass();
  assert.equal(useGameStore.getState().inboundPassRequest, null);
  useGameStore.setState({
    phase: 'INBOUND_PHASE',
    inbound: { stage: 'POSITIONING', remaining: 5, owner: 0 },
  });
  game.requestInboundPass(1);
  assert.equal(useGameStore.getState().inboundPassRequest, null);
  game.requestInboundPass(0);
  assert.deepEqual(useGameStore.getState().inboundPassRequest, { id: 1, receiver: 0 });
  // Authoritative simulation, rather than a throttled HUD stage, decides whether to launch.
  game.requestInboundPass();
  assert.deepEqual(useGameStore.getState().inboundPassRequest, { id: 2, receiver: 0 });
  game.pause();
  game.requestInboundPass();
  assert.equal(useGameStore.getState().inboundPassRequest, null);
  game.resume();
  game.requestInboundPass();
  assert.equal(useGameStore.getState().inboundPassRequest?.id, 3);
  game.requestInboundAction();
  assert.deepEqual(useGameStore.getState().inboundPassRequest, {
    id: 4,
    receiver: 0,
    positioning: true,
  });
  game.reset();
  assert.equal(useGameStore.getState().inboundPassRequest, null);
  assert.equal(useGameStore.getState().passType, null);
});

test('session transitions clear pending inbound and held input, preserve preferences, and restart the active drill', () => {
  const game = useGameStore.getState();
  game.choose(0, 'chuck');
  game.toggleSound();
  game.requestInboundPass();
  useInputStore.getState().setAxis(1, -1);
  useInputStore.getState().setAction('actionA', true);
  const before = useGameStore.getState();
  game.startSession({ kind: 'training', drill: 'movement' });
  const training = useGameStore.getState();
  assert.deepEqual(training.session, { kind: 'training', drill: 'movement' });
  assert.equal(training.revision, before.revision + 1);
  assert.equal(training.legends, before.legends);
  assert.equal(training.sound, false);
  assert.equal(training.cpu, false);
  assert.equal(training.ballState, 'inactive');
  assert.equal(training.owner, -1);
  assert.equal(training.inbound, null);
  assert.equal(training.inboundPassRequest, null);
  assert.equal(training.inboundRequestSequence, 0);
  assert.equal(training.phase, 'LIVE');
  assert.equal(useInputStore.getState().moveX, 0);
  assert.equal(useInputStore.getState().actionA, false);
  game.requestInboundAction();
  assert.equal(useGameStore.getState().inboundPassRequest, null);
  game.pause();
  game.resume();
  assert.equal(useGameStore.getState().revision, training.revision);
  game.reset();
  assert.deepEqual(useGameStore.getState().session, training.session);
  assert.equal(useGameStore.getState().revision, training.revision + 1);
  game.startSession({ kind: 'duel' });
  assert.deepEqual(useGameStore.getState().session, { kind: 'duel' });
  assert.equal(useGameStore.getState().ballState, 'inbound');
  assert.equal(useGameStore.getState().cpu, true);
});

test('changing a training character flushes actions and keeps the menu paused', () => {
  const game = useGameStore.getState();
  game.startSession({ kind: 'training', drill: 'movement' });
  game.pause();
  const before = useGameStore.getState();
  useInputStore.getState().setAction('actionB', true);
  game.choose(0, 'chuck');
  const next = useGameStore.getState();
  assert.equal(next.screen, 'paused');
  assert.equal(next.session, before.session);
  assert.equal(next.revision, before.revision + 1);
  assert.equal(next.legends[0], 'chuck');
  assert.equal(next.ballState, 'inactive');
  assert.equal(next.inbound, null);
  assert.equal(useInputStore.getState().actionB, false);
});
