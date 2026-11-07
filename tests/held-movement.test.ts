import assert from 'node:assert/strict';
import test from 'node:test';
import {
  cancelHeldMovement,
  createMovementTracker,
  stepHeldMovement,
  stepTimedHeldMovement,
} from '../src/game/simulation/heldMovement';
import { config } from '../src/game/data/gameConfig';
const { jabTapWindow } = config.handling;
const min = config.player.minMove;
const fresh = () => ({ dirHeld: 0, pendingMoveX: 0, pendingMoveZ: 0 });

test('a short direction tap jabs only on release and retains its direction', () => {
  for (const [x, z] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ]) {
    const gesture = fresh();
    assert.equal(stepHeldMovement(gesture, x, z, 0.04, min, jabTapWindow), null);
    assert.equal(stepHeldMovement(gesture, 0, 0, 0.016, min, jabTapWindow), 'jab');
    assert.equal(gesture.pendingMoveX, x);
    assert.equal(gesture.pendingMoveZ, z);
    assert.equal(stepHeldMovement(gesture, 0, 0, 0.016, min, jabTapWindow), null);
  }
});

test('continuing or changing held directions enters dribble directly within the tap window', () => {
  const gesture = fresh();
  assert.equal(stepHeldMovement(gesture, 1, 0, 0.05, min, jabTapWindow), null);
  assert.equal(stepHeldMovement(gesture, 0, -1, 0.05, min, jabTapWindow), 'dribble');
  assert.equal(gesture.dirHeld, 0);
  assert.equal(stepHeldMovement(gesture, 0, 0, 0.016, min, jabTapWindow), null);
});

test('input-event timing preserves an entire tap between frames without multiplying hold duration by physics substeps', () => {
  const tracker = createMovementTracker(min);
  tracker.update(1, 0, 10);
  tracker.update(0, 0, 10.04);
  const gesture = fresh();
  assert.equal(
    stepTimedHeldMovement(gesture, 0, 0, 0, tracker.takeReleases(), min, jabTapWindow),
    'jab',
  );
  assert.equal(tracker.takeReleases().length, 0);
  tracker.update(0, 1, 11);
  for (let step = 0; step < 12; step++)
    assert.equal(
      stepTimedHeldMovement(gesture, 0, 1, tracker.duration(11.04), [], min, jabTapWindow),
      null,
    );
  assert.ok(Math.abs(gesture.dirHeld - 0.04) < 1e-8);
  assert.equal(
    stepTimedHeldMovement(gesture, 0, 1, tracker.duration(11.11), [], min, jabTapWindow),
    'dribble',
  );
});

test('flush/charge cancellation discards pending taps and held directions', () => {
  const tracker = createMovementTracker(min);
  tracker.update(1, 0, 0);
  tracker.update(0, 0, 0.04);
  tracker.cancel();
  assert.deepEqual(tracker.takeReleases(), []);
  const gesture = fresh();
  stepHeldMovement(gesture, 1, 0, 0.04, min, jabTapWindow);
  cancelHeldMovement(gesture);
  assert.equal(stepHeldMovement(gesture, 0, 0, 0.016, min, jabTapWindow), null);
});
