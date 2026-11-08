export const CONTROL_ACTIONS = [
  'MOVE_LEFT',
  'MOVE_RIGHT',
  'MOVE_UP',
  'MOVE_DOWN',
  'ACTION_A',
  'ACTION_B',
  'HAND_LEFT',
  'HAND_RIGHT',
  'PAUSE',
] as const;
export type ControlAction = (typeof CONTROL_ACTIONS)[number];
export type ControlContext = 'offense' | 'defense';
export type InputDevice = 'keyboard' | 'gamepad' | 'mobile';
export type PadBinding =
  { kind: 'button'; index: number } | { kind: 'axis'; index: number; sign: 1 | -1 };
export const TOUCH_SLOTS = ['square', 'triangle', 'circle', 'cross'] as const;
export type TouchSlot = (typeof TOUCH_SLOTS)[number];
export interface ContextBindings {
  keyboard: Record<ControlAction, string[]>;
  gamepad: Record<ControlAction, PadBinding | null>;
  mobile: Record<TouchSlot, ControlAction | null>;
}
export interface ControlProfile {
  offense: ContextBindings;
  defense: ContextBindings;
  deadzone: number;
  /** Explicit neutral calibration per controller model, independent of action bindings. */
  padNeutral: Record<string, number[]>;
}
export const ACTION_LABELS: Record<ControlContext, Record<ControlAction, string>> = {
  offense: {
    MOVE_LEFT: 'Kretanje levo',
    MOVE_RIGHT: 'Kretanje desno',
    MOVE_UP: 'Kretanje napred',
    MOVE_DOWN: 'Kretanje nazad',
    ACTION_A: 'Šut · drži i pusti',
    ACTION_B: 'Stav / zagrađivanje / inbound',
    HAND_LEFT: 'Leva ruka · dribling / crossover',
    HAND_RIGHT: 'Desna ruka · dribling / crossover',
    PAUSE: 'Pauza / nastavak',
  },
  defense: {
    MOVE_LEFT: 'Kretanje levo',
    MOVE_RIGHT: 'Kretanje desno',
    MOVE_UP: 'Kretanje napred',
    MOVE_DOWN: 'Kretanje nazad',
    ACTION_A: 'Contest / pokušaj krađe',
    ACTION_B: 'Niski stav / kontakt',
    HAND_LEFT: 'Leva ruka (sa loptom)',
    HAND_RIGHT: 'Desna ruka (sa loptom)',
    PAUSE: 'Pauza / nastavak',
  },
};
export const TOUCH_GLYPHS: Record<TouchSlot, string> = {
  square: '□',
  triangle: '△',
  circle: '○',
  cross: '✕',
};
export function createDefaultProfile(): ControlProfile {
  const context = (): ContextBindings => ({
    keyboard: {
      MOVE_LEFT: ['KeyA', 'ArrowLeft'],
      MOVE_RIGHT: ['KeyD', 'ArrowRight'],
      MOVE_UP: ['KeyW', 'ArrowUp'],
      MOVE_DOWN: ['KeyS', 'ArrowDown'],
      ACTION_A: ['KeyR', 'Space'],
      ACTION_B: ['KeyQ', 'KeyJ'],
      HAND_LEFT: ['KeyZ'],
      HAND_RIGHT: ['KeyC'],
      PAUSE: ['Escape'],
    },
    gamepad: {
      MOVE_LEFT: { kind: 'axis', index: 0, sign: -1 },
      MOVE_RIGHT: { kind: 'axis', index: 0, sign: 1 },
      MOVE_UP: { kind: 'axis', index: 1, sign: -1 },
      MOVE_DOWN: { kind: 'axis', index: 1, sign: 1 },
      ACTION_A: { kind: 'button', index: 2 },
      ACTION_B: { kind: 'button', index: 3 },
      HAND_LEFT: { kind: 'axis', index: 2, sign: -1 },
      HAND_RIGHT: { kind: 'axis', index: 2, sign: 1 },
      PAUSE: { kind: 'button', index: 9 },
    },
    mobile: { square: 'ACTION_A', triangle: 'ACTION_B', circle: 'HAND_LEFT', cross: 'HAND_RIGHT' },
  });
  const offense = context(),
    defense = context();
  defense.mobile.circle = null;
  defense.mobile.cross = null;
  return { offense, defense, deadzone: 0.18, padNeutral: {} };
}
export function isPadBinding(value: unknown): value is PadBinding {
  if (!value || typeof value !== 'object') return false;
  const b = value as PadBinding;
  return (
    Number.isInteger(b.index) &&
    b.index >= 0 &&
    b.index < 64 &&
    (b.kind === 'button' || (b.kind === 'axis' && (b.sign === 1 || b.sign === -1)))
  );
}
export function restoreProfile(value: unknown): ControlProfile {
  const out = createDefaultProfile();
  if (!value || typeof value !== 'object') return out;
  const saved = value as Partial<ControlProfile>;
  if (typeof saved.deadzone === 'number' && Number.isFinite(saved.deadzone))
    out.deadzone = Math.max(0.05, Math.min(0.4, saved.deadzone));
  if (saved.padNeutral && typeof saved.padNeutral === 'object') {
    for (const [key, axes] of Object.entries(saved.padNeutral).slice(0, 32))
      if (
        key.length <= 4096 &&
        Array.isArray(axes) &&
        axes.length <= 64 &&
        axes.every((v) => v === -1 || v === 0 || v === 1)
      )
        out.padNeutral[key] = [...axes];
  }
  for (const context of ['offense', 'defense'] as const) {
    const data = saved[context];
    if (!data || typeof data !== 'object') continue;
    for (const action of CONTROL_ACTIONS) {
      const keys = data.keyboard?.[action];
      if (
        Array.isArray(keys) &&
        keys.length > 0 &&
        keys.length <= 8 &&
        keys.every((k) => typeof k === 'string' && /^[A-Za-z0-9]+$/.test(k) && k.length < 40)
      )
        out[context].keyboard[action] = keys;
      const pad = data.gamepad?.[action];
      if (pad === null || isPadBinding(pad)) out[context].gamepad[action] = pad;
    }
    for (const slot of TOUCH_SLOTS) {
      const action = data.mobile?.[slot];
      if (action === null || CONTROL_ACTIONS.includes(action as ControlAction))
        out[context].mobile[slot] = action;
    }
  }
  return out;
}
export function keyAction(bindings: ContextBindings, code: string): ControlAction | undefined {
  if (code === 'Escape') return 'PAUSE'; // emergency exit remains available after remapping
  return CONTROL_ACTIONS.find((a) => bindings.keyboard[a].includes(code));
}
export function bindingLabel(binding: PadBinding | null): string {
  if (!binding) return 'Nije dodeljeno';
  if (binding.kind === 'axis') return `Axis ${binding.index} ${binding.sign < 0 ? '−' : '+'}`;
  const names: Record<number, string> = {
    0: '✕ / A',
    1: '○ / B',
    2: '□ / X',
    3: '△ / Y',
    4: 'L1 / LB',
    5: 'R1 / RB',
    6: 'L2 / LT',
    7: 'R2 / RT',
    9: 'Options / Menu',
  };
  return `Button ${binding.index}${names[binding.index] ? ` · ${names[binding.index]}` : ''}`;
}
export function keyLabel(code: string) {
  const labels: Record<string, string> = {
    Space: 'Space',
    Escape: 'Esc',
    ArrowLeft: '←',
    ArrowRight: '→',
    ArrowUp: '↑',
    ArrowDown: '↓',
  };
  return labels[code] ?? code.replace(/^Key/, '').replace(/^Digit/, '');
}
