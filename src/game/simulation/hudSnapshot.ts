import type { BallState, Fighter, InboundStage, Mode } from './types';
import type { InboundPassType } from './tacticalPass';

export type GamePhase = 'LIVE' | 'INBOUND_PHASE';
export type HandlingState = 'hold' | 'dribble' | 'none';
export interface InboundState {
  stage: 'POSITIONING' | 'PASS_WINDOW';
  remaining: number;
  owner: number;
}

/** A serializable UI projection; mutable simulation objects never enter the store. */
export interface HudSnapshot {
  score: number;
  cpuScore: number;
  energies: [number, number];
  modes: [Mode, Mode];
  owner: number;
  ballState: BallState;
  charge: number;
  message: string;
  cpu: boolean;
  phase: GamePhase;
  inbound: InboundState | null;
  handling: [HandlingState, HandlingState];
  holdProgress: number;
  passType: InboundPassType | null;
  riskyPass: boolean;
}

interface HudRuntime {
  players: readonly Fighter[];
  score: readonly number[];
  owner: number;
  ballState: BallState;
  time: number;
  message: string;
  messageUntil: number;
  p2Human: boolean;
  inboundStage: InboundStage;
  inboundClock: number;
  inboundOwner: number;
  inboundPass?: { type: InboundPassType; risky: boolean } | null;
}

interface HudSettings {
  exhaustedThreshold: number;
  jabTapWindow: number;
}

function reusePair<T>(previous: [T, T], first: T, second: T): [T, T] {
  return previous[0] === first && previous[1] === second ? previous : [first, second];
}

/** Preserve nested references and skip notifications when the visible state is unchanged. */
export function createHudSnapshot(
  runtime: HudRuntime,
  previous: HudSnapshot,
  settings: HudSettings,
): HudSnapshot {
  const [first, second] = runtime.players;
  const mode = (player: Fighter): Mode =>
    player.energy < settings.exhaustedThreshold && player.mode === 'idle'
      ? 'exhausted'
      : player.mode;
  const handling = (slot: number): HandlingState =>
    runtime.owner === slot && runtime.ballState === 'held'
      ? runtime.players[slot].handling
      : 'none';

  let inbound: InboundState | null = null;
  if (runtime.ballState === 'inbound') {
    const stage = runtime.inboundStage === 'position' ? 'POSITIONING' : 'PASS_WINDOW';
    const remaining = Math.max(0, runtime.inboundClock);
    inbound =
      previous.inbound?.stage === stage &&
      previous.inbound.remaining === remaining &&
      previous.inbound.owner === runtime.inboundOwner
        ? previous.inbound
        : { stage, remaining, owner: runtime.inboundOwner };
  }

  const snapshot: HudSnapshot = {
    score: runtime.score[0],
    cpuScore: runtime.score[1],
    energies: reusePair(previous.energies, first.energy, second.energy),
    modes: reusePair(previous.modes, mode(first), mode(second)),
    owner: runtime.owner,
    ballState: runtime.ballState,
    charge: first.charge,
    message: runtime.time < runtime.messageUntil ? runtime.message : '',
    cpu: !runtime.p2Human,
    phase: runtime.ballState === 'inbound' ? 'INBOUND_PHASE' : 'LIVE',
    inbound,
    handling: reusePair(previous.handling, handling(0), handling(1)),
    holdProgress: Math.min(1, first.dirHeld / settings.jabTapWindow),
    passType: runtime.ballState === 'pass' ? (runtime.inboundPass?.type ?? null) : null,
    riskyPass: runtime.ballState === 'pass' && (runtime.inboundPass?.risky ?? false),
  };

  return (Object.keys(snapshot) as (keyof HudSnapshot)[]).every((key) =>
    Object.is(snapshot[key], previous[key]),
  )
    ? previous
    : snapshot;
}
