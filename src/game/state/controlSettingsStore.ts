import { create } from 'zustand';
import {
  CONTROL_ACTIONS,
  TOUCH_SLOTS,
  createDefaultProfile,
  restoreProfile,
  acceptsPadBinding,
  type ControlAction,
  type ControlContext,
  type ControlProfile,
  type PadBinding,
  type TouchSlot,
} from '../input/controlBindings';
import { padCalibrationKey, type PadDevice } from '../input/gamepadInput';
const STORAGE_KEY = 'suits.controls.v1';
function readSaved() {
  try {
    return restoreProfile(JSON.parse(globalThis.localStorage?.getItem(STORAGE_KEY) ?? 'null'));
  } catch {
    return createDefaultProfile();
  }
}
function save(profile: ControlProfile) {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(profile));
  } catch {
    /* In-memory controls still work if storage is unavailable. */
  }
}
interface Settings {
  profile: ControlProfile;
  capturing: boolean;
  setCapturing: (active: boolean) => void;
  bindKey: (context: ControlContext, action: ControlAction, code: string) => void;
  bindPad: (context: ControlContext, action: ControlAction, binding: PadBinding) => void;
  bindTouch: (context: ControlContext, action: ControlAction, slot: TouchSlot) => void;
  setDeadzone: (value: number) => void;
  calibratePad: (pad: PadDevice) => boolean;
  resetBindings: () => void;
}
export const useControlSettingsStore = create<Settings>((set, get) => {
  const update = (mutate: (profile: ControlProfile) => void) => {
    const next = structuredClone(get().profile);
    mutate(next);
    save(next);
    set({ profile: next, capturing: false });
  };
  return {
    profile: readSaved(),
    capturing: false,
    setCapturing: (capturing) => set({ capturing }),
    bindKey: (context, action, code) =>
      update((p) => {
        const keys = p[context].keyboard,
          old = keys[action][0];
        for (const other of CONTROL_ACTIONS)
          if (other !== action && keys[other].includes(code)) {
            keys[other] = keys[other].filter((k) => k !== code);
            if (!keys[other].length) keys[other] = [old];
          }
        keys[action] = [code];
      }),
    bindPad: (context, action, binding) => {
      if (!acceptsPadBinding(action, binding)) return;
      update((p) => {
        const map = p[context].gamepad,
          old = map[action];
        for (const other of CONTROL_ACTIONS)
          if (other !== action && JSON.stringify(map[other]) === JSON.stringify(binding))
            map[other] = acceptsPadBinding(other, old) ? old : null;
        map[action] = binding;
      });
    },
    bindTouch: (context, action, slot) =>
      update((p) => {
        const map = p[context].mobile,
          old = map[slot];
        for (const other of TOUCH_SLOTS)
          if (other !== slot && map[other] === action) map[other] = old;
        map[slot] = action;
      }),
    setDeadzone: (value) => {
      if (Number.isFinite(value))
        update((p) => {
          p.deadzone = Math.max(0.05, Math.min(0.4, value));
        });
    },
    calibratePad: (pad) => {
      if (pad.axes.length > 64 || !pad.axes.every((v) => Number.isFinite(v) && Math.abs(v) <= 1))
        return false;
      update((p) => {
        p.padNeutral[padCalibrationKey(pad)] = pad.axes.map((v) =>
          v <= -0.8 ? -1 : v >= 0.8 ? 1 : 0,
        );
      });
      return true;
    },
    resetBindings: () => {
      const profile = createDefaultProfile();
      save(profile);
      set({ profile, capturing: false });
    },
  };
});
