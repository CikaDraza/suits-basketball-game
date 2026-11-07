import { create } from 'zustand';
import type { RapierRigidBody } from '@react-three/rapier';
import { createHoopRig, type HoopRig } from './hoopRig';
import { INBOUND, nearestSidelineSpot, type Boundary } from './rules';
import { BALL } from './constants';

export type Team = 'home' | 'away';
export type Phase = 'live' | 'dead' | 'inbound';
export type Vec3 = [number, number, number];

/** Tag rigid bodies with this via the RigidBody `userData` prop. */
export type BodyTag =
  | { kind: 'ball' }
  | { kind: 'foot'; playerId: string; team: Team }
  | { kind: 'hand'; playerId: string; team: Team }
  | { kind: 'hoop'; part: string };

export interface Violation {
  kind: 'ball-oob' | 'player-oob' | 'inbound-10s';
  offender: Team;
  boundary?: Boundary;
  at: [number, number]; // x, z
  playerId?: string;
  time: number;
}

export interface Inbound { team: Team; spot: Vec3; startedAt: number; deadline: number }
export interface HoopImpulse { point: Vec3; impulse: Vec3 } // world space, force ON the rim

interface GameState {
  phase: Phase;
  possession: Team;
  lastTouch: Team | null;
  ballHandlerId: string | null;
  turnovers: Record<Team, number>;
  violations: Violation[];
  inbound: Inbound | null;

  // transient (mutated in useFrame — never subscribe to these)
  ballBody: RapierRigidBody | null;
  hoopRig: HoopRig;
  hoopImpulses: HoopImpulse[];
  rimHang: { remaining: number; strength: number };

  registerBall: (b: RapierRigidBody | null) => void;
  setLastTouch: (team: Team, playerId?: string) => void;
  setBallHandler: (playerId: string | null, team?: Team) => void;
  pushHoopImpulse: (point: Vec3, impulse: Vec3) => void;
  hangOnRim: (seconds: number, strength?: number) => void;
  callBallOutOfBounds: (x: number, z: number, boundary: Boundary) => void;
  callPlayerOutOfBounds: (playerId: string, team: Team, x: number, z: number, boundary: Boundary) => void;
  completeInbound: () => void;
  tickInbound: (now: number) => void;
}

const other = (t: Team): Team => (t === 'home' ? 'away' : 'home');

export const useGameStore = create<GameState>()((set, get) => {
  /** Pause possession, register turnover, award ball, start the 10 s sideline inbound. */
  const turnover = (v: Violation) => {
    const awarded = other(v.offender);
    const spot = nearestSidelineSpot(v.at[0], v.at[1]);
    const now = performance.now();
    const ball = get().ballBody;
    if (ball) {
      ball.setLinvel({ x: 0, y: 0, z: 0 }, true);
      ball.setAngvel({ x: 0, y: 0, z: 0 }, true);
      ball.setTranslation({ x: spot[0], y: BALL.RADIUS + 0.9, z: spot[2] }, true);
      ball.sleep();
    }
    set((s) => ({
      phase: 'inbound',
      possession: awarded,
      lastTouch: null,
      ballHandlerId: null,
      turnovers: { ...s.turnovers, [v.offender]: s.turnovers[v.offender] + 1 },
      violations: [...s.violations, v],
      inbound: { team: awarded, spot, startedAt: now, deadline: now + INBOUND.TIME_LIMIT_MS },
    }));
  };

  return {
    phase: 'live',
    possession: 'home',
    lastTouch: null,
    ballHandlerId: null,
    turnovers: { home: 0, away: 0 },
    violations: [],
    inbound: null,

    ballBody: null,
    hoopRig: createHoopRig(),
    hoopImpulses: [],
    rimHang: { remaining: 0, strength: 1 },

    registerBall: (b) => set({ ballBody: b }),
    setLastTouch: (team) => set({ lastTouch: team }),
    setBallHandler: (playerId, team) =>
      set((s) => ({ ballHandlerId: playerId, lastTouch: team ?? s.lastTouch, possession: team ?? s.possession })),
    pushHoopImpulse: (point, impulse) => { get().hoopImpulses.push({ point, impulse }); },
    hangOnRim: (seconds, strength = 1) => { const h = get().rimHang; h.remaining = seconds; h.strength = strength; },

    callBallOutOfBounds: (x, z, boundary) => {
      const s = get();
      if (s.phase !== 'live') return;
      turnover({ kind: 'ball-oob', offender: s.lastTouch ?? s.possession, boundary, at: [x, z], time: performance.now() });
    },

    callPlayerOutOfBounds: (playerId, team, x, z, boundary) => {
      const s = get();
      if (s.phase !== 'live') return;
      // Only the team in possession can commit an out-of-bounds turnover.
      if (team !== s.possession) return;
      turnover({ kind: 'player-oob', offender: team, boundary, at: [x, z], playerId, time: performance.now() });
    },

    completeInbound: () => set({ phase: 'live', inbound: null }),

    tickInbound: (now) => {
      const { phase, inbound } = get();
      if (phase !== 'inbound' || !inbound || now < inbound.deadline) return;
      set({ phase: 'live' }); // re-arm so the 10 s violation can register
      turnover({ kind: 'inbound-10s', offender: inbound.team, at: [inbound.spot[0], inbound.spot[2]], time: now });
    },
  };
});
