import { create } from 'zustand';
import { config, level, type Legend } from '../data/gameConfig';
import { INITIAL_MESSAGE } from '../simulation/types';
import type { PlayerSlot } from '../simulation/types';
import type { HudSnapshot } from '../simulation/hudSnapshot';
import { useInputStore } from './inputStore';

export type { GamePhase, HandlingState, InboundState } from '../simulation/hudSnapshot';
export type InboundStage = 'POSITIONING' | 'PASS_WINDOW';
export type GameScreen = 'playing' | 'paused' | 'gameover' | 'win';

export interface GameStore extends HudSnapshot {
  screen: GameScreen;
  health: number;
  maxHealth: number;
  lives: number;
  level: number;
  finalScore: number;
  legends: [Legend, Legend];
  messageId: number;
  revision: number;
  sound: boolean;
  inboundPassRequest: { id: number; receiver: PlayerSlot; positioning?: boolean } | null;
  inboundRequestSequence: number;
  requestInboundPass: (receiver?: PlayerSlot) => void;
  requestInboundAction: (receiver?: PlayerSlot) => void;
  setScreen: (screen: GameScreen) => void;
  pause: () => void;
  resume: () => void;
  reset: () => void;
  choose: (slot: number, legend: Legend) => void;
  toggleSound: () => void;
}

/** Fresh tuples on reset keep previous store snapshots immutable. */
export function createInitialHudSnapshot(): HudSnapshot {
  return {
    score: 0,
    cpuScore: 0,
    energies: [config.player.energyMax, config.player.energyMax],
    modes: ['idle', 'idle'],
    owner: -1,
    ballState: 'inbound',
    charge: 0,
    message: INITIAL_MESSAGE,
    cpu: true,
    phase: 'INBOUND_PHASE',
    inbound: {
      stage: 'POSITIONING',
      remaining: config.inbound.positionTime,
      owner: level.initialOwner,
    },
    handling: ['none', 'none'],
    holdProgress: 0,
    passType: null,
    riskyPass: false,
  };
}

function inboundRequest(state: GameStore, receiver: PlayerSlot, positioning = false) {
  if (
    state.screen !== 'playing' ||
    state.phase !== 'INBOUND_PHASE' ||
    state.inbound?.owner !== receiver
  )
    return state;
  const id = state.inboundRequestSequence + 1;
  return {
    inboundPassRequest: positioning ? { id, receiver, positioning: true } : { id, receiver },
    inboundRequestSequence: id,
  };
}

export const useGameStore = create<GameStore>((set, get) => ({
  ...createInitialHudSnapshot(),
  screen: 'playing',
  health: 100,
  maxHealth: 100,
  lives: 1,
  level: 1,
  finalScore: 0,
  legends: ['shaq', 'chuck'],
  messageId: 0,
  revision: 0,
  sound: true,
  inboundPassRequest: null,
  inboundRequestSequence: 0,
  requestInboundPass: (receiver = 0) => {
    // Intent only: the fixed-step simulation checks its authoritative clock,
    // position and lane. The HUD's throttled stage must not drive physics.
    set((state) => inboundRequest(state, receiver));
  },
  requestInboundAction: (receiver = 0) => set((state) => inboundRequest(state, receiver, true)),
  setScreen: (screen) => {
    if (get().screen === screen) return;
    useInputStore.getState().flush();
    set({ screen, inboundPassRequest: null });
  },
  pause: () => {
    if (get().screen === 'playing') get().setScreen('paused');
  },
  resume: () => {
    if (get().screen === 'paused') get().setScreen('playing');
  },
  reset: () => {
    useInputStore.getState().flush();
    set((state) => ({
      ...createInitialHudSnapshot(),
      screen: 'playing',
      health: state.maxHealth,
      lives: 1,
      level: 1,
      finalScore: 0,
      messageId: 0,
      inboundPassRequest: null,
      inboundRequestSequence: 0,
      revision: state.revision + 1,
    }));
  },
  choose: (slot, legend) => {
    if ((slot !== 0 && slot !== 1) || get().legends[slot] === legend) return;
    set((state) => {
      const legends: [Legend, Legend] = [...state.legends];
      legends[slot] = legend;
      return { legends, revision: state.revision + 1 };
    });
  },
  toggleSound: () => set((state) => ({ sound: !state.sound })),
}));
