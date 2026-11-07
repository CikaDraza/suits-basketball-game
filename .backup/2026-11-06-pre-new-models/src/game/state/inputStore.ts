import { create } from "zustand";

interface InputStore {
  moveX: number;
  moveZ: number;
  actionA: boolean;
  actionB: boolean;
  pause: boolean;

  setAxis: (x: number, z: number) => void;
  setAction: (action: "actionA" | "actionB" | "pause", active: boolean) => void;
  flush: () => void;
}

export const useInputStore = create<InputStore>((set) => ({
  moveX: 0,
  moveZ: 0,
  actionA: false,
  actionB: false,
  pause: false,

  setAxis: (x, z) => set({ moveX: x, moveZ: z }),

  setAction: (action, active) => set({ [action]: active }),

  flush: () =>
    set({
      moveX: 0,
      moveZ: 0,
      actionA: false,
      actionB: false,
      pause: false,
    }),
}));
