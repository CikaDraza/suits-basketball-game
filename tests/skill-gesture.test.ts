import assert from 'node:assert/strict';
import test from 'node:test';
import { PerspectiveCamera, Vector3 } from 'three';
import { config } from '../src/game/data/gameConfig';
import { createMovementTransform } from '../src/game/simulation/coordinates';
import { createSkillGesture } from '../src/game/input/skillGesture';
import {
  createDefaultProfile,
  restoreProfile,
  type ControlAction,
} from '../src/game/input/controlBindings';

const cam = config.camera;
const pitchScale =
  (cam.height - cam.target[1]) / Math.hypot(cam.horizontalDistance, cam.height - cam.target[1]);
const movement = createMovementTransform(cam.inputAngle);
const faceStick = (x: number, z: number) => {
  const direction = movement.stickToWorld(x, z);
  return Math.atan2(direction.x, direction.z);
};
const orientations = [
  ['screen-left', faceStick(-1, 0)],
  ['screen-right', faceStick(1, 0)],
  ['basket', -Math.PI / 2],
  ['away', Math.PI / 2],
  ['up-left', faceStick(-1, 1)],
  ['up-right', faceStick(1, 1)],
  ['down-left', faceStick(-1, -1)],
  ['down-right', faceStick(1, -1)],
] as const;
const directions = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [-1, 1],
  [1, -1],
  [-1, -1],
] as const;

function lockedCamera() {
  const camera = new PerspectiveCamera();
  const target = new Vector3(...cam.target);
  const flat = new Vector3(cam.position[0] - target.x, 0, cam.position[2] - target.z).normalize();
  camera.position
    .copy(target)
    .setY(0)
    .addScaledVector(flat, cam.horizontalDistance)
    .setY(cam.height);
  camera.lookAt(target);
  camera.updateMatrixWorld(true);
  return camera;
}

test('all cardinal/diagonal gestures match the anatomical hand projected into the locked camera plane', () => {
  const camera = lockedCamera();
  let accepted = 0,
    ambiguous = 0;
  for (const legend of ['shaq', 'chuck'])
    for (const [name, facing] of orientations)
      for (const [x, z] of directions) {
        // Independent Three camera-space projection, not the skill helper formula.
        const visibleRight = new Vector3(-Math.cos(facing), 0, Math.sin(facing)).transformDirection(
          camera.matrixWorldInverse,
        );
        const dot =
          (x * visibleRight.x + z * visibleRight.y) /
          (Math.hypot(x, z) * Math.hypot(visibleRight.x, visibleRight.y));
        const gesture = createSkillGesture(cam.inputAngle, { verticalScale: pitchScale });
        assert.equal(gesture.sample({ x: 0, z: 0 }, facing), null);
        const command = gesture.sample({ x, z }, facing);
        const where = `${legend} ${name} stick[${x},${z}] dot=${dot}`;
        if (Math.abs(dot) <= 0.25) {
          assert.equal(command, null, `${where}: ambiguous forward/backward must keep hand`);
          ambiguous++;
        } else {
          assert.equal(command?.hand, dot > 0 ? -1 : 1, where);
          assert.equal(command?.facing, facing, `${where}: snapshot orientation`);
          accepted++;
        }
        // A turn cannot reinterpret either an accepted or an ambiguous held gesture.
        assert.equal(
          gesture.sample({ x, z }, facing + Math.PI),
          null,
          `${where}: held during turn`,
        );
      }
  assert.ok(accepted > 64);
  assert.ok(ambiguous > 0);
});

test('the near/bottom gesture chooses the right hand when the player faces screen-right', () => {
  const facing = faceStick(1, 0);
  const gesture = createSkillGesture(cam.inputAngle, { verticalScale: pitchScale });
  gesture.sample({ x: 0, z: 0 }, facing);
  assert.equal(gesture.sample({ x: 0, z: -1 }, facing)?.hand, -1);
  gesture.sample({ x: 0, z: 0 }, facing);
  assert.equal(gesture.sample({ x: 0, z: 1 }, facing)?.hand, 1);
});

test('pitch compression affects diagonal visible-side interpretation without changing the camera', () => {
  const cameraBefore = structuredClone(config.camera);
  const projectedGroundRight = movement.stickToWorld(0.45, -Math.sqrt(1 - 0.45 ** 2));
  const facing = Math.atan2(projectedGroundRight.z, -projectedGroundRight.x);
  const actual = createSkillGesture(cam.inputAngle, { verticalScale: pitchScale });
  const yawOnly = createSkillGesture(cam.inputAngle);
  actual.sample({ x: 0, z: 0 }, facing);
  yawOnly.sample({ x: 0, z: 0 }, facing);
  const a = actual.sample({ x: 1, z: 1 }, facing);
  const y = yawOnly.sample({ x: 1, z: 1 }, facing);
  assert.notEqual(a?.hand, y?.hand, 'yaw-only interpretation loses the visible camera plane');
  assert.deepEqual(config.camera, cameraBefore);
});

test('activation/release hysteresis emits once, rearms only through neutral and survives repeated sampling at 20/30/60/120 Hz', () => {
  for (const rate of [20, 30, 60, 120]) {
    const gesture = createSkillGesture(cam.inputAngle, { verticalScale: pitchScale });
    const facing = faceStick(1, 0);
    assert.equal(gesture.sample({ x: 0, z: -1 }, facing), null, 'constructor waits for neutral');
    gesture.sample({ x: 0, z: 0 }, facing);
    assert.equal(gesture.sample({ x: 0, z: -0.64 }, facing), null, 'below activation');
    const first = gesture.sample({ x: 0, z: -0.65 }, facing);
    assert.equal(first?.hand, -1);
    for (let n = 0; n < rate; n++)
      assert.equal(
        gesture.sample({ x: 0, z: -1 }, facing + (n / rate) * Math.PI),
        null,
        `@${rate} repeated held command`,
      );
    assert.equal(
      gesture.sample({ x: 0, z: 0.5 }, facing),
      null,
      'crossing to the other side without neutral does not rearm',
    );
    gesture.sample({ x: 0, z: 0.25 }, facing);
    const second = gesture.sample({ x: 0, z: 1 }, facing);
    assert.equal(second?.hand, 1);
    assert.equal(second?.sequence, first!.sequence + 1);
    gesture.reset();
    assert.equal(gesture.sample({ x: 0, z: -1 }, facing), null, 'reset while held stays disarmed');
    gesture.sample({ x: 0, z: 0 }, facing);
    assert.equal(gesture.sample({ x: 0, z: -1 }, facing)?.hand, -1);
  }
});

test('non-finite skill samples do not activate or leave a gesture armed', () => {
  const gesture = createSkillGesture(cam.inputAngle);
  gesture.sample({ x: 0, z: 0 }, 0);
  assert.equal(gesture.sample({ x: Number.NaN, z: 0 }, 0), null);
  assert.equal(gesture.sample({ x: -1, z: 0 }, 0), null);
  gesture.sample({ x: 0, z: 0 }, 0);
  assert.equal(gesture.sample({ x: -1, z: 0 }, Number.POSITIVE_INFINITY), null);
});

test('legacy default hand axes migrate to a full camera-relative skill map', () => {
  const legacy = createDefaultProfile();
  for (const context of ['offense', 'defense'] as const) {
    for (const action of ['SKILL_LEFT', 'SKILL_RIGHT', 'SKILL_UP', 'SKILL_DOWN'])
      delete (legacy[context].gamepad as Partial<typeof legacy.offense.gamepad>)[
        action as ControlAction
      ];
    legacy[context].gamepad.HAND_LEFT = { kind: 'axis', index: 2, sign: -1 };
    legacy[context].gamepad.HAND_RIGHT = { kind: 'axis', index: 2, sign: 1 };
  }
  const restored = restoreProfile(legacy);
  assert.equal(restored.offense.gamepad.HAND_LEFT, null);
  assert.equal(restored.offense.gamepad.HAND_RIGHT, null);
  assert.deepEqual(restored.offense.gamepad.SKILL_LEFT, { kind: 'axis', index: 2, sign: -1 });
  assert.deepEqual(restored.offense.gamepad.SKILL_UP, { kind: 'axis', index: 3, sign: -1 });
  assert.deepEqual(restored.offense.keyboard.HAND_LEFT, ['KeyZ']);
  assert.deepEqual(restored.defense.gamepad.ACTION_A, { kind: 'button', index: 2 });
  assert.deepEqual(restored.offense.mobile.circle, 'HAND_LEFT');
});

test('custom legacy hand bindings are preserved and conflicting default skill directions do not double-fire', () => {
  const restored = restoreProfile({
    offense: {
      gamepad: {
        HAND_LEFT: { kind: 'axis', index: 3, sign: -1 },
        HAND_RIGHT: { kind: 'button', index: 7 },
      },
    },
  });
  assert.deepEqual(restored.offense.gamepad.HAND_LEFT, { kind: 'axis', index: 3, sign: -1 });
  assert.deepEqual(restored.offense.gamepad.HAND_RIGHT, { kind: 'button', index: 7 });
  assert.equal(restored.offense.gamepad.SKILL_UP, null);
  assert.deepEqual(restored.offense.gamepad.SKILL_DOWN, { kind: 'axis', index: 3, sign: 1 });
  assert.deepEqual(restoreProfile(JSON.parse(JSON.stringify(restored))), restored);
});
