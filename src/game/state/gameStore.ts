import { motionRecorder } from '../diagnostics/recorder';
import { motionAudit } from '../diagnostics/motionAudit';
import { create } from 'zustand';
import { config, level, type Legend } from '../data/gameConfig';
import { INITIAL_MESSAGE } from '../simulation/types';
import type { PlayerSlot } from '../simulation/types';
import type { HudSnapshot } from '../simulation/hudSnapshot';
import { useInputStore } from './inputStore';

export type { GamePhase, HandlingState, InboundState } from '../simulation/hudSnapshot';
export type InboundStage = 'POSITIONING' | 'PASS_WINDOW';
export type GameScreen = 'playing' | 'paused' | 'gameover' | 'win';

export type GameSession =
  | { kind: 'duel' }
  | { kind: 'training'; drill: 'movement' | 'solo' }
  | { kind: 'training'; drill: 'one-on-one'; role: 'offense' | 'defense' };

// Future drills have a contract, but cannot be started until implemented.
export type PlayableSession = { kind: 'duel' } | { kind: 'training'; drill: 'movement' };
export const isFreeMovement = (session: GameSession) =>
  session.kind === 'training' && session.drill === 'movement';

export interface GameStore extends HudSnapshot {
  session: GameSession;
  startSession: (session: PlayableSession) => void;
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
export function createInitialHudSnapshot(session: GameSession = { kind: 'duel' }): HudSnapshot {
  return {
    score: 0,
    cpuScore: 0,
    energies: [config.player.energyMax, config.player.energyMax],
    modes: ['idle', 'idle'],
    owner: -1,
    ballState: isFreeMovement(session) ? 'inactive' : 'inbound',
    charge: 0,
    message: isFreeMovement(session)
      ? 'Free Movement · Movement, Defense, Footwork.'
      : INITIAL_MESSAGE,
    cpu: !isFreeMovement(session),
    phase: isFreeMovement(session) ? 'LIVE' : 'INBOUND_PHASE',
    inbound: isFreeMovement(session)
      ? null
      : {
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
  const auditId = import.meta.env?.DEV
    ? motionAudit.request(receiver, 'inbound', { positioning })
    : 0;
  if (
    state.screen !== 'playing' ||
    state.phase !== 'INBOUND_PHASE' ||
    state.inbound?.owner !== receiver
  ) {
    if (import.meta.env?.DEV)
      motionAudit.decision(
        receiver,
        auditId,
        'inbound',
        'rejected',
        'not-inbound-receiver-or-hud-not-ready',
      );
    return state;
  }
  const id = state.inboundRequestSequence + 1;
  if (import.meta.env?.DEV) {
    motionAudit.decision(receiver, auditId, 'inbound', 'queued');
    motionAudit.queueInbound(id, auditId, receiver);
  }
  return {
    inboundPassRequest: positioning ? { id, receiver, positioning: true } : { id, receiver },
    inboundRequestSequence: id,
  };
}

export const useGameStore = create<GameStore>((set, get) => ({
  ...createInitialHudSnapshot(),
  session: { kind: 'duel' },
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
    if (import.meta.env?.DEV)
      motionRecorder.event('session.screen', { from: get().screen, to: screen });
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
    const session = get().session;
    if (session.kind === 'duel') get().startSession({ kind: 'duel' });
    else if (session.drill === 'movement')
      get().startSession({ kind: 'training', drill: 'movement' });
  },
  startSession: (session) => {
    if (session.kind !== 'duel' && !isFreeMovement(session)) return;
    useInputStore.getState().flush();
    set((state) => ({
      ...createInitialHudSnapshot(session),
      session: { ...session },
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
    useInputStore.getState().flush();
    set((state) => {
      const legends: [Legend, Legend] = [...state.legends];
      legends[slot] = legend;
      return {
        ...createInitialHudSnapshot(state.session),
        legends,
        inboundPassRequest: null,
        inboundRequestSequence: 0,
        revision: state.revision + 1,
      };
    });
  },
  toggleSound: () => set((state) => ({ sound: !state.sound })),
}));
