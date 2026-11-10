import { create } from 'zustand';

interface HarnessStore {
  testMode: boolean;
  debugColliders: boolean;
  debugHands: boolean;
  debugRightStick: boolean;
  debugFeet: boolean;
  inspectionView: 'front' | 'side' | null;
  setInspectionView: (view: 'front' | 'side' | null) => void;
  debugLabels: boolean;
  seed: number;
  fps: number;
  triangles: number;
  drawCalls: number;

  setTestMode: (enabled: boolean) => void;
  setDebugColliders: (enabled: boolean) => void;
  setDebugHands: (enabled: boolean) => void;
  setDebugRightStick: (enabled: boolean) => void;
  setDebugFeet: (enabled: boolean) => void;
  setSeed: (seed: number) => void;
  setFps: (fps: number) => void;
  setRendererInfo: (info: { triangles: number; drawCalls: number }) => void;
  setPerformance: (info: { fps: number; triangles: number; drawCalls: number }) => void;
}

export const useHarnessStore = create<HarnessStore>((set) => ({
  testMode: false,
  debugColliders: false,
  debugHands: false,
  debugRightStick: false,
  debugFeet: false,
  inspectionView: null,
  setInspectionView: (inspectionView) => set({ inspectionView }),
  debugLabels: false,
  seed: 42,
  fps: 0,
  triangles: 0,
  drawCalls: 0,

  setTestMode: (enabled) => set({ testMode: enabled }),

  setDebugColliders: (enabled) => set({ debugColliders: enabled }),
  setDebugHands: (enabled) => set({ debugHands: enabled }),
  setDebugRightStick: (enabled) => set({ debugRightStick: enabled }),
  setDebugFeet: (enabled) => set({ debugFeet: enabled }),

  setSeed: (seed) => set({ seed }),

  setFps: (fps) => set({ fps }),

  setRendererInfo: (info) => set({ triangles: info.triangles, drawCalls: info.drawCalls }),

  setPerformance: (info) =>
    set((state) =>
      state.fps === info.fps &&
      state.triangles === info.triangles &&
      state.drawCalls === info.drawCalls
        ? state
        : info,
    ),
}));
