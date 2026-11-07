import type { LocomotionSnapshot } from '../entities/locomotionDebug';
import { useGameStore } from '../state/gameStore';
import { useInputStore } from '../state/inputStore';
import { useHarnessStore } from '../state/harnessStore';
import type { CharacterPoseSnapshot } from './characterPose';

export type TestSeam = {
  ready: boolean;
  requestInboundPass?: (receiver?: 0 | 1) => void;
  getCharacterPose?: (slot: 0 | 1) => CharacterPoseSnapshot | null;
  getHandContacts?: (slot: 0 | 1) => CharacterPoseSnapshot['hands'];
  /** gait/posture/upper-body diagnostics written by Character each frame */
  getLocomotion?: (slot: 0 | 1) => LocomotionSnapshot | null;
  setHandling?: (slot: 0 | 1, mode: 'hold' | 'dribble', hand: 1 | -1) => void;
  inspectCharacter?: (view: 'front' | 'side' | null) => void;
  version: string;
  mode: 'dev' | 'test' | 'prod';
  getState: () => Record<string, unknown>;
  getEntities: () => unknown[];
  getPerformance: () => { fps: number; triangles: number; drawCalls: number };
  setInput: (
    input: Partial<{
      moveX: number;
      moveZ: number;
      actionA: boolean;
      actionB: boolean;
      pause: boolean;
    }>,
  ) => void;
  press: (action: string, frames?: number) => Promise<void>;
  step: (frames?: number) => Promise<void>;
  teleport: (entityId: string, position: [number, number, number]) => void;
  reset: (seed?: number, scenario?: string) => Promise<void>;
  setDebugFlag: (flag: string, value: boolean) => void;
  /** world point → CSS pixel position on screen (for screenshot crops / HUD alignment checks) */
  project?: (p: [number, number, number]) => { x: number; y: number };
  /** pick the legend for a slot (0 = P1, 1 = P2/CPU) */
  setLegend?: (slot: number, legend: 'shaq' | 'chuck') => void;
  /** P1/P2 grip (between the palms) and the ball, for hold checks */
  getGrip?: (slot: number) => {
    grip: { x: number; y: number; z: number; ok: boolean };
    ball: { x: number; y: number; z: number };
  };
};

declare global {
  interface Window {
    __TEST__?: TestSeam;
  }
}

function createDefaultTestSeam(): TestSeam {
  const gameStore = useGameStore;
  const inputStore = useInputStore;
  const harnessStore = useHarnessStore;

  return {
    ready: false,
    version: '1.0.0',
    mode: import.meta.env.DEV ? 'dev' : 'prod',

    getState: () => {
      const { screen, score, health, maxHealth, lives, level, finalScore } = gameStore.getState();
      return { screen, score, health, maxHealth, lives, level, finalScore };
    },

    getEntities: () => [],

    getPerformance: () => {
      const { fps, triangles, drawCalls } = harnessStore.getState();
      return { fps, triangles, drawCalls };
    },

    setInput: (input) => {
      const state = inputStore.getState();
      if (input.moveX !== undefined || input.moveZ !== undefined) {
        state.setAxis(input.moveX ?? state.moveX, input.moveZ ?? state.moveZ);
      }
      if (input.actionA !== undefined) state.setAction('actionA', input.actionA);
      if (input.actionB !== undefined) state.setAction('actionB', input.actionB);
      if (input.pause !== undefined) state.setAction('pause', input.pause);
    },

    press: async () => {
      // Stub — agent implements per-game via extendTestSeam().
    },

    step: async () => {
      // Stub — agent implements per-game via extendTestSeam().
    },

    teleport: () => {
      // Stub — agent implements per-game via extendTestSeam().
    },

    reset: async (seed) => {
      gameStore.getState().reset();
      if (seed !== undefined) harnessStore.getState().setSeed(seed);
    },

    setDebugFlag: (flag, value) => {
      if (flag === 'colliders') harnessStore.getState().setDebugColliders(value);
      if (flag === 'handContacts') harnessStore.getState().setDebugHands(value);
      if (flag === 'footContacts') harnessStore.getState().setDebugFeet(value);
      if (flag === 'testMode') harnessStore.getState().setTestMode(value);
    },
  };
}

export function exposeTestSeam() {
  const defaults = createDefaultTestSeam();

  window.__TEST__ = {
    ...defaults,
    ...(window.__TEST__ ?? {}),
    ready: window.__TEST__?.ready ?? false,
    version: window.__TEST__?.version ?? defaults.version,
    mode: window.__TEST__?.mode ?? defaults.mode,
  };

  return window.__TEST__;
}

export function extendTestSeam(extension: Partial<TestSeam>) {
  const seam = exposeTestSeam();

  window.__TEST__ = {
    ...seam,
    ...extension,
    ready: extension.ready ?? seam.ready,
    version: extension.version ?? seam.version,
    mode: extension.mode ?? seam.mode,
  };

  return window.__TEST__;
}
