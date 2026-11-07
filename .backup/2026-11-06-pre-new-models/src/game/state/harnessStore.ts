import { create } from "zustand";

interface HarnessStore {
  testMode: boolean;
  debugColliders: boolean;
  debugLabels: boolean;
  seed: number;
  fps: number;
  triangles: number;
  drawCalls: number;

  setTestMode: (enabled: boolean) => void;
  setDebugColliders: (enabled: boolean) => void;
  setSeed: (seed: number) => void;
  setFps: (fps: number) => void;
  setRendererInfo: (info: { triangles: number; drawCalls: number }) => void;
}

export const useHarnessStore = create<HarnessStore>((set) => ({
  testMode: false,
  debugColliders: false,
  debugLabels: false,
  seed: 42,
  fps: 0,
  triangles: 0,
  drawCalls: 0,

  setTestMode: (enabled) => set({ testMode: enabled }),

  setDebugColliders: (enabled) => set({ debugColliders: enabled }),

  setSeed: (seed) => set({ seed }),

  setFps: (fps) => set({ fps }),

  setRendererInfo: (info) => set({ triangles: info.triangles, drawCalls: info.drawCalls }),
}));
