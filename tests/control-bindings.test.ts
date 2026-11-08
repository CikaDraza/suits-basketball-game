import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import {
  createDefaultProfile,
  isPadBinding,
  keyAction,
  restoreProfile,
} from '../src/game/input/controlBindings';
import {
  createPadGate,
  getPadNeutral,
  padCalibrationKey,
  isPadNeutral,
  nthConnectedPad,
  padValue,
  pressedPadBinding,
  readGamepadInput,
  type PadState,
} from '../src/game/input/gamepadInput';
import { useControlSettingsStore } from '../src/game/state/controlSettingsStore';

function pad(axes: number[] = [0, 0, 0, 0], pressed: number[] = []): PadState {
  return {
    axes,
    buttons: Array.from({ length: 16 }, (_, index) => ({
      pressed: pressed.includes(index),
      touched: pressed.includes(index),
      value: pressed.includes(index) ? 1 : 0,
    })),
  };
}

beforeEach(() => {
  useControlSettingsStore.setState({ profile: createDefaultProfile(), capturing: false });
});

test('the right stick provides an independent camera-relative 2D skill vector', () => {
  const profile = createDefaultProfile();
  const left = readGamepadInput(pad([0, 0, -1, 0]), profile.offense, profile.deadzone);
  assert.equal(left.hand, 0);
  assert.deepEqual(left.skill, { x: -1, z: 0 });
  assert.equal(left.x, 0);
  assert.equal(left.z, 0);
  const right = readGamepadInput(pad([0, 0, 1, 0]), profile.offense, profile.deadzone);
  assert.equal(right.hand, 0);
  assert.deepEqual(right.skill, { x: 1, z: 0 });
  assert.equal(right.q, false);
  assert.equal(right.r, false);
  assert.equal(readGamepadInput(pad([0, 0, 0.12, 0]), profile.offense, profile.deadzone).hand, 0);
  assert.deepEqual(
    readGamepadInput(pad([0, 0, 0.12, 0]), profile.offense, profile.deadzone).skill,
    { x: 0, z: 0 },
  );
  assert.deepEqual(readGamepadInput(pad([0, 0, 0, -1]), profile.offense, profile.deadzone).skill, {
    x: 0,
    z: 1,
  });
  assert.deepEqual(readGamepadInput(pad([0, 0, 0, 1]), profile.offense, profile.deadzone).skill, {
    x: 0,
    z: -1,
  });
});

test('skill axes use a radial deadzone and preserve cardinal/diagonal direction', () => {
  const profile = createDefaultProfile();
  const diagonal = readGamepadInput(pad([0, 0, 1, -1]), profile.offense, profile.deadzone).skill;
  assert.ok(Math.abs(diagonal.x - Math.SQRT1_2) < 1e-12);
  assert.ok(Math.abs(diagonal.z - Math.SQRT1_2) < 1e-12);
  const below = readGamepadInput(pad([0, 0, 0.12, -0.12]), profile.offense, profile.deadzone).skill;
  assert.deepEqual(below, { x: 0, z: 0 });
  const radial = readGamepadInput(
    pad([0, 0, 0.15, -0.15]),
    profile.offense,
    profile.deadzone,
  ).skill;
  assert.ok(radial.x > 0 && radial.z > 0, 'diagonal radial magnitude is above deadzone');
  assert.ok(Math.abs(radial.x - radial.z) < 1e-12);
  assert.ok(
    Math.abs(Math.hypot(radial.x, radial.z) - (Math.hypot(0.15, 0.15) - 0.18) / 0.82) < 1e-12,
  );
});

test('the full skill pair is remappable while anatomical hand buttons stay explicit', () => {
  const profile = createDefaultProfile();
  profile.offense.gamepad.SKILL_LEFT = { kind: 'axis', index: 5, sign: -1 };
  profile.offense.gamepad.SKILL_RIGHT = { kind: 'axis', index: 5, sign: 1 };
  profile.offense.gamepad.SKILL_UP = { kind: 'axis', index: 4, sign: -1 };
  profile.offense.gamepad.SKILL_DOWN = { kind: 'axis', index: 4, sign: 1 };
  profile.offense.gamepad.HAND_LEFT = { kind: 'button', index: 10 };
  const mapped = readGamepadInput(pad([0, 0, 1, -1, 1, -1], [10]), profile.offense, 0.18);
  assert.equal(mapped.hand, 1);
  assert.equal(mapped.x, 0);
  assert.equal(mapped.z, 0);
  assert.ok(Math.abs(mapped.skill.x + Math.SQRT1_2) < 1e-12);
  assert.ok(Math.abs(mapped.skill.z + Math.SQRT1_2) < 1e-12);
});

test('mapped gamepad buttons and axis directions use the learned binding, not a hard-coded face index', () => {
  const profile = createDefaultProfile();
  profile.offense.gamepad.ACTION_A = { kind: 'button', index: 7 };
  assert.equal(readGamepadInput(pad([], [2]), profile.offense, profile.deadzone).r, false);
  assert.equal(readGamepadInput(pad([], [7]), profile.offense, profile.deadzone).r, true);
  profile.offense.gamepad.ACTION_B = { kind: 'axis', index: 3, sign: -1 };
  assert.equal(readGamepadInput(pad([0, 0, 0, -0.9]), profile.offense, profile.deadzone).q, true);
  assert.equal(readGamepadInput(pad([0, 0, 0, 0.9]), profile.offense, profile.deadzone).q, false);
});

test('analog deadzones retain proportional movement, reject invalid values and normalize diagonals', () => {
  const profile = createDefaultProfile();
  const drift = readGamepadInput(pad([0.1, -0.1]), profile.offense, 0.18);
  assert.equal(drift.x, 0);
  assert.equal(drift.z, 0);
  const half = readGamepadInput(pad([0.59, 0]), profile.offense, 0.18);
  assert.ok(Math.abs(half.x - 0.5) < 1e-12);
  const diagonal = readGamepadInput(pad([1, -1]), profile.offense, 0.18);
  assert.ok(Math.abs(Math.hypot(diagonal.x, diagonal.z) - 1) < 1e-12);
  const invalid = readGamepadInput(
    pad([Number.NaN, Number.POSITIVE_INFINITY]),
    profile.offense,
    0.18,
  );
  assert.equal(invalid.x, 0);
  assert.equal(invalid.z, 0);
  assert.equal(padValue(pad(), { kind: 'button', index: 40 }, 0.18), 0);
  assert.equal(readGamepadInput(null, profile.offense, 0.18).pause, false);
});

test('connected controllers are selected from actual connected entries including sparse indices', () => {
  const first = { ...pad(), connected: true, index: 2 } as Gamepad;
  const second = { ...pad(), connected: true, index: 5 } as Gamepad;
  const disconnected = { ...pad(), connected: false, index: 0 } as Gamepad;
  assert.equal(nthConnectedPad([disconnected, null, first, null, second], 0), first);
  assert.equal(nthConnectedPad([disconnected, null, first, null, second], 1), second);
  assert.equal(nthConnectedPad([null, first], 1), null);
});

test('capture distinguishes neutral pads, intentional buttons and strong signed axis movement', () => {
  assert.equal(isPadNeutral(pad()), true);
  assert.equal(pressedPadBinding(pad()), null);
  assert.equal(isPadNeutral(pad([0, 0, -0.9, 0])), false);
  assert.deepEqual(pressedPadBinding(pad([0, 0, -0.9, 0])), { kind: 'axis', index: 2, sign: -1 });
  assert.deepEqual(pressedPadBinding(pad([0, 0, 0, 0.8])), { kind: 'axis', index: 3, sign: 1 });
  assert.deepEqual(pressedPadBinding(pad([], [10])), { kind: 'button', index: 10 });
  assert.equal(isPadNeutral(pad([], [10])), false);
});

test('explicit neutral calibration supports triggers on any axis without guessing held sticks', () => {
  const device = { ...pad([0, 0, -1, 0, 0, -1]), id: 'nonstandard pad', mapping: '' } as Gamepad;
  const gate = createPadGate();
  assert.equal(isPadNeutral(device), false, 'an uncalibrated deflection must stay blocked');
  assert.equal(gate(device, 0, 0, 0.18), false);
  assert.equal(useControlSettingsStore.getState().calibratePad(device), true);
  const profile = useControlSettingsStore.getState().profile;
  const baseline = getPadNeutral(profile, device);
  assert.deepEqual(baseline, [0, 0, -1, 0, 0, -1]);
  assert.equal(isPadNeutral(device, 0.25, baseline), true);
  assert.equal(gate(device, 0, 0, 0.18, baseline), true);
  assert.equal(pressedPadBinding(device, baseline), null);
  assert.equal(readGamepadInput(device, profile.offense, 0.18, baseline).hand, 0);
  const trigger = pressedPadBinding(pad([0, 0, 0.8, 0, 0, -1]), baseline);
  assert.deepEqual(trigger, { kind: 'axis', index: 2, sign: 1 });
  assert.equal(padValue(device, trigger, 0.18, baseline), 0);
  assert.ok(padValue(pad([0, 0, 0, 0, 0, -1]), trigger, 0.18, baseline) > 0.35);
  assert.equal(padValue(pad([0, 0, 1, 0, 0, -1]), trigger, 0.18, baseline), 1);
  assert.equal(padValue(pad([]), trigger, 0.18, baseline), 0, 'missing axes remain released');
  assert.deepEqual(pressedPadBinding(pad([0, 0, -1, -0.9, 0, -1]), baseline), {
    kind: 'axis',
    index: 3,
    sign: -1,
  });
  assert.equal(isPadNeutral(pad([0, 0, -1, -0.9, 0, -1]), 0.25, baseline), false);
  assert.deepEqual(restoreProfile(JSON.parse(JSON.stringify(profile))), profile);
  assert.equal(gate(device, 0, 0, 0.18), false, 'removing a calibration invalidates the gate');
  const other = { ...device, id: 'standard pad' };
  assert.equal(getPadNeutral(profile, other), undefined);
  assert.equal(isPadNeutral(other, 0.25, getPadNeutral(profile, other)), false);
});

test('endpoint trigger calibrations are scoped to device layout and validated on restore', () => {
  const device = { ...pad([0.02, -0.03, 1, 0]), id: 'positive trigger', mapping: '' } as Gamepad;
  const settings = useControlSettingsStore.getState();
  assert.equal(settings.calibratePad(device), true);
  const profile = useControlSettingsStore.getState().profile;
  const baseline = getPadNeutral(profile, device);
  assert.deepEqual(baseline, [0, 0, 1, 0]);
  const trigger = pressedPadBinding(pad([0, 0, -0.8, 0]), baseline);
  assert.deepEqual(trigger, { kind: 'axis', index: 2, sign: -1 });
  assert.equal(padValue(device, trigger, 0.18, baseline), 0);
  assert.equal(padValue(pad([0, 0, -1, 0]), trigger, 0.18, baseline), 1);
  assert.equal(getPadNeutral(profile, { ...device, mapping: 'standard' }), undefined);
  assert.equal(getPadNeutral(profile, { ...device, axes: [0, 0] }), undefined);
  assert.equal(settings.calibratePad({ ...device, axes: [Number.NaN] }), false);
  assert.equal(settings.calibratePad({ ...device, axes: [2] }), false);
  assert.equal(settings.calibratePad({ ...device, axes: Array(65).fill(0) }), false);
  const key = padCalibrationKey(device);
  assert.equal(key, JSON.stringify(['positive trigger', '', 4]));
  assert.deepEqual(restoreProfile({ padNeutral: { [key]: [0, 0, 1, 0], bad: [0.2] } }).padNeutral, {
    [key]: [0, 0, 1, 0],
  });
  settings.resetBindings();
  assert.equal(getPadNeutral(useControlSettingsStore.getState().profile, device), undefined);
});

test('a gamepad is neutral-gated after reset, reconnect, and controller replacement', () => {
  const gate = createPadGate();
  const asGamepad = (state: PadState, id = 'controller', index = 2) =>
    ({ ...state, id, index, connected: true }) as Gamepad;
  const held = asGamepad(pad([0, 0, 1, 0]));
  const neutral = asGamepad(pad([0, 0, 0, 0]));
  assert.equal(gate(held, 0, 0, 0.18), false);
  assert.equal(gate(neutral, 0, 0, 0.18), true);
  assert.equal(gate(held, 0, 0, 0.18), true);
  assert.equal(gate(held, 0, 1, 0.18), false);
  assert.equal(gate(neutral, 0, 1, 0.18), true);
  assert.equal(gate(null, 0, 1, 0.18), false);
  assert.equal(gate(held, 0, 1, 0.18), false);
  assert.equal(gate(neutral, 0, 1, 0.18), true);
  assert.equal(gate(asGamepad(pad([0, 0, -1]), 'replacement', 4), 0, 1, 0.18), false);
  assert.equal(gate(asGamepad(pad(), 'replacement', 4), 0, 1, 0.18), true);
});

test('remapping swaps collisions and leaves the other offense/defense profile independent', () => {
  const settings = useControlSettingsStore.getState();
  const original = settings.profile;
  settings.bindKey('offense', 'ACTION_A', 'KeyZ');
  const keys = useControlSettingsStore.getState().profile.offense.keyboard;
  assert.deepEqual(keys.ACTION_A, ['KeyZ']);
  assert.deepEqual(keys.HAND_LEFT, ['KeyR']);
  assert.equal(keyAction(useControlSettingsStore.getState().profile.offense, 'KeyZ'), 'ACTION_A');
  assert.deepEqual(original.offense.keyboard.ACTION_A, ['KeyR', 'Space']);
  assert.deepEqual(useControlSettingsStore.getState().profile.defense.keyboard.ACTION_A, [
    'KeyR',
    'Space',
  ]);
  assert.equal(keyAction(useControlSettingsStore.getState().profile.offense, 'Escape'), 'PAUSE');

  settings.bindPad('offense', 'ACTION_A', { kind: 'axis', index: 2, sign: 1 });
  const pads = useControlSettingsStore.getState().profile.offense.gamepad;
  assert.deepEqual(pads.ACTION_A, { kind: 'axis', index: 2, sign: 1 });
  assert.deepEqual(pads.SKILL_RIGHT, { kind: 'button', index: 2 });
  assert.equal(pads.HAND_RIGHT, null);
  settings.bindTouch('offense', 'ACTION_A', 'triangle');
  const mobile = useControlSettingsStore.getState().profile.offense.mobile;
  assert.equal(mobile.triangle, 'ACTION_A');
  assert.equal(mobile.square, 'ACTION_B');
  assert.equal(useControlSettingsStore.getState().profile.defense.mobile.square, 'ACTION_A');
  settings.resetBindings();
  assert.deepEqual(useControlSettingsStore.getState().profile, createDefaultProfile());
});

test('stored profiles roundtrip learned controls and discard malformed bindings', () => {
  const profile = createDefaultProfile();
  profile.offense.keyboard.ACTION_A = ['KeyF'];
  profile.defense.gamepad.ACTION_A = { kind: 'axis', index: 3, sign: -1 };
  profile.offense.mobile.cross = 'ACTION_A';
  assert.deepEqual(restoreProfile(JSON.parse(JSON.stringify(profile))), profile);
  const restored = restoreProfile({
    deadzone: 900,
    offense: {
      keyboard: { ACTION_A: ['<script>'], ACTION_B: [] },
      gamepad: {
        ACTION_A: { kind: 'axis', index: -1, sign: 1 },
        ACTION_B: { kind: 'button', index: 1000 },
      },
      mobile: { square: 'UNSUPPORTED', triangle: null },
    },
  });
  assert.equal(restored.deadzone, 0.4);
  assert.deepEqual(restored.offense.keyboard.ACTION_A, ['KeyR', 'Space']);
  assert.deepEqual(restored.offense.keyboard.ACTION_B, ['KeyQ', 'KeyJ']);
  assert.deepEqual(restored.offense.gamepad.ACTION_A, { kind: 'button', index: 2 });
  assert.equal(restored.offense.mobile.square, 'ACTION_A');
  assert.equal(restored.offense.mobile.triangle, null);
  assert.equal(isPadBinding({ kind: 'axis', index: 2, sign: 0 }), false);
  assert.deepEqual(restoreProfile(null), createDefaultProfile());
});
