import { create } from 'zustand';
import type { DefensiveArmMode } from '../input/defensiveHands';

interface HarnessStore {
  testMode: boolean;
  debugColliders: boolean;
  debugHands: boolean;
  debugFeet: boolean;
  inspectionView: 'front' | 'side' | 'rear' | null;
  setInspectionView: (view: 'front' | 'side' | 'rear' | null) => void;
  defensivePose: [DefensiveArmMode | null, DefensiveArmMode | null];
  defensivePoseAt: [number, number];
  setDefensivePose: (slot: 0 | 1, pose: DefensiveArmMode | null, time?: number) => void;
  debugLabels: boolean;
  seed: number;
  fps: number;
  triangles: number;
  drawCalls: number;

  setTestMode: (enabled: boolean) => void;
  setDebugColliders: (enabled: boolean) => void;
  setDebugHands: (enabled: boolean) => void;
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
  debugFeet: false,
  inspectionView: null,
  setInspectionView: (inspectionView) => set({ inspectionView }),
  defensivePose: [null, null],
  defensivePoseAt: [0, 0],
  setDefensivePose: (slot, pose, time = 0) =>
    set((state) => {
      const defensivePose = [...state.defensivePose] as typeof state.defensivePose;
      const defensivePoseAt = [...state.defensivePoseAt] as typeof state.defensivePoseAt;
      defensivePose[slot] = pose;
      defensivePoseAt[slot] = time;
      return { defensivePose, defensivePoseAt };
    }),
  debugLabels: false,
  seed: 42,
  fps: 0,
  triangles: 0,
  drawCalls: 0,

  setTestMode: (enabled) => set({ testMode: enabled }),

  setDebugColliders: (enabled) => set({ debugColliders: enabled }),
  setDebugHands: (enabled) => set({ debugHands: enabled }),
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
