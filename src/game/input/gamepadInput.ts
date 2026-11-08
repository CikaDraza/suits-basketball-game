import type { ContextBindings, ControlProfile, PadBinding } from './controlBindings';
export type PadState = Pick<Gamepad, 'axes' | 'buttons'>;
export type PadDevice = Pick<Gamepad, 'id' | 'mapping' | 'axes'>;
export function padCalibrationKey(pad: PadDevice): string {
  return JSON.stringify([pad.id, pad.mapping, pad.axes.length]);
}
export function getPadNeutral(profile: ControlProfile, pad: PadDevice | null) {
  if (!pad) return undefined;
  const axes = profile.padNeutral[padCalibrationKey(pad)];
  return axes?.length === pad.axes.length ? axes : undefined;
}
/** Axis excursion from a deliberately calibrated neutral, including endpoint triggers. */
function axisSignal(pad: PadState, index: number, neutralAxes?: readonly number[]) {
  const rest = neutralAxes?.[index] ?? 0;
  const raw = pad.axes[index] ?? rest;
  if (!Number.isFinite(raw) || !Number.isFinite(rest)) return 0;
  const delta = raw - rest;
  if (delta === 0) return 0;
  const range = delta > 0 ? 1 - rest : 1 + rest;
  return range > 0 ? Math.max(-1, Math.min(1, delta / range)) : 0;
}
export function nthConnectedPad(pads: readonly (Gamepad | null)[], slot: number) {
  let found = 0;
  for (const pad of pads)
    if (pad?.connected) {
      if (found++ === slot) return pad;
    }
  return null;
}
export function padValue(
  pad: PadState,
  b: PadBinding | null,
  deadzone: number,
  neutralAxes?: readonly number[],
): number {
  if (!b) return 0;
  const raw =
    b.kind === 'button'
      ? (pad.buttons[b.index]?.value ?? (pad.buttons[b.index]?.pressed ? 1 : 0))
      : axisSignal(pad, b.index, neutralAxes) * b.sign;
  if (!Number.isFinite(raw)) return 0;
  if (b.kind === 'button') return Math.max(0, Math.min(1, raw));
  return raw <= deadzone ? 0 : Math.min(1, (raw - deadzone) / (1 - deadzone));
}
export function readGamepadInput(
  pad: PadState | null,
  map: ContextBindings,
  deadzone: number,
  neutralAxes?: readonly number[],
) {
  const value = (action: keyof ContextBindings['gamepad']) =>
    pad ? padValue(pad, map.gamepad[action], deadzone, neutralAxes) : 0;
  let x = value('MOVE_RIGHT') - value('MOVE_LEFT'),
    z = value('MOVE_UP') - value('MOVE_DOWN');
  const length = Math.hypot(x, z);
  if (length > 1) {
    x /= length;
    z /= length;
  }
  const left = value('HAND_LEFT'),
    right = value('HAND_RIGHT');
  return {
    x,
    z,
    q: value('ACTION_B') > 0.5,
    r: value('ACTION_A') > 0.5,
    hand: left > 0.55 && left > right ? 1 : right > 0.55 ? -1 : 0,
    pause: value('PAUSE') > 0.5,
  };
}
/** Capture only after a neutral sample; callers suppress the binding gesture itself. */
export function pressedPadBinding(
  pad: PadState,
  neutralAxes?: readonly number[],
): PadBinding | null {
  const button = pad.buttons.findIndex((b) => b.pressed || b.value > 0.65);
  if (button >= 0) return { kind: 'button', index: button };
  let binding: PadBinding | null = null,
    peak = 0.7;
  pad.axes.forEach((_, i) => {
    const value = axisSignal(pad, i, neutralAxes);
    if (Math.abs(value) > peak) {
      peak = Math.abs(value);
      binding = { kind: 'axis', index: i, sign: value < 0 ? -1 : 1 };
    }
  });
  return binding;
}
export function isPadNeutral(pad: PadState, deadzone = 0.25, neutralAxes?: readonly number[]) {
  return (
    pad.buttons.every((b) => !b.pressed && b.value < 0.2) &&
    pad.axes.every((v, i) => Number.isFinite(v) && Math.abs(v - (neutralAxes?.[i] ?? 0)) < deadzone)
  );
}

export function createPadGate() {
  const slots = new Map<
    number,
    {
      id: string;
      index: number;
      version: number;
      ready: boolean;
      neutralAxes?: readonly number[];
    }
  >();
  return (
    pad: Gamepad | null,
    slot: number,
    version: number,
    deadzone: number,
    neutralAxes?: readonly number[],
  ) => {
    if (!pad) {
      slots.delete(slot);
      return false;
    }
    let entry = slots.get(slot);
    if (
      !entry ||
      entry.id !== pad.id ||
      entry.index !== pad.index ||
      entry.version !== version ||
      entry.neutralAxes !== neutralAxes
    ) {
      entry = { id: pad.id, index: pad.index, version, ready: false, neutralAxes };
      slots.set(slot, entry);
    }
    if (isPadNeutral(pad, deadzone + 0.03, neutralAxes)) entry.ready = true;
    return entry.ready;
  };
}
