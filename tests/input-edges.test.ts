import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { getInputResetVersion, takeButtonEdges, useInputStore } from '../src/game/state/inputStore';

beforeEach(() => useInputStore.getState().flush());

test('short action and hand taps survive until the simulation consumes their edges', () => {
  const input = useInputStore.getState();
  input.setAction('handRight', true);
  input.setAction('handRight', true);
  input.setAction('handRight', false);
  input.setAction('actionB', true);
  input.setAction('actionB', false);
  assert.equal(useInputStore.getState().handRight, false);
  assert.deepEqual(takeButtonEdges(), [
    { action: 'handRight', active: true },
    { action: 'handRight', active: false },
    { action: 'actionB', active: true },
    { action: 'actionB', active: false },
  ]);
  assert.deepEqual(takeButtonEdges(), [], 'edges have one consumer and drain once');
});

test('flushing clears movement, held actions and queued taps while invalidating pad gates', () => {
  const input = useInputStore.getState();
  const version = getInputResetVersion();
  input.setAxis(0.5, -0.5);
  input.setAction('handLeft', true);
  input.setAction('actionA', true);
  input.flush();
  assert.equal(getInputResetVersion(), version + 1);
  const state = useInputStore.getState();
  assert.equal(state.moveX, 0);
  assert.equal(state.moveZ, 0);
  assert.equal(state.handLeft, false);
  assert.equal(state.actionA, false);
  assert.deepEqual(takeButtonEdges(), []);
});
