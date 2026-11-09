import { create } from 'zustand';
import { clamp } from '../utils/math';
import { config } from '../data/gameConfig';
import { createMovementTracker } from '../simulation/heldMovement';

export type InputAction = 'actionA' | 'actionB' | 'inbound' | 'handLeft' | 'handRight' | 'pause';

interface InputState {
  moveX: number;
  moveZ: number;
  actionA: boolean;
  actionB: boolean;
  inbound: boolean;
  handLeft: boolean;
  handRight: boolean;
  pause: boolean;
}

interface InputStore extends InputState {
  setAxis: (x: number, z: number) => void;
  setAction: (action: InputAction, active: boolean) => void;
  flush: () => void;
}

const EMPTY_INPUT: InputState = {
  moveX: 0,
  moveZ: 0,
  actionA: false,
  actionB: false,
  inbound: false,
  handLeft: false,
  handRight: false,
  pause: false,
};

const normalizeAxis = (value: number) => (Number.isFinite(value) ? clamp(value, -1, 1) : 0);

// Cancellation also covers gamepads and an empty flush without notifying UI subscribers.
let inputResetVersion = 0;
const buttonEdges: { action: InputAction; active: boolean }[] = [];
export function takeButtonEdges() {
  return buttonEdges.splice(0);
}
export const getInputResetVersion = () => inputResetVersion;
const movement = createMovementTracker(config.player.minMove);
export const getHeldMovementDuration = () => movement.duration(performance.now() / 1000);
export const takeReleasedMovements = () => movement.takeReleases();

export const useInputStore = create<InputStore>((set) => ({
  ...EMPTY_INPUT,
  setAxis: (x, z) => {
    const moveX = normalizeAxis(x);
    const moveZ = normalizeAxis(z);
    set((state) => {
      if (state.moveX === moveX && state.moveZ === moveZ) return state;
      movement.update(moveX, moveZ, performance.now() / 1000);
      return { moveX, moveZ };
    });
  },
  setAction: (action, active) => {
    set((state) => {
      if (state[action] === active) return state;
      if (buttonEdges.length < 128) buttonEdges.push({ action, active });
      return { [action]: active };
    });
  },
  flush: () => {
    inputResetVersion++;
    movement.cancel();
    buttonEdges.length = 0;
    set((state) =>
      state.moveX === 0 &&
      state.moveZ === 0 &&
      !state.actionA &&
      !state.actionB &&
      !state.inbound &&
      !state.handLeft &&
      !state.handRight &&
      !state.pause
        ? state
        : EMPTY_INPUT,
    );
  },
}));
