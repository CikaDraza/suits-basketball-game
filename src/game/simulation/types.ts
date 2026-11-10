import type { Legend } from '../data/gameConfig';
import type { DefensiveHands } from '../input/defensiveHands';
import type { InboundPassPlan, InboundPassOutcome, PassPoint } from './tacticalPass';

export type PlayerSlot = 0 | 1;
export type BallState =
  'inactive' | 'held' | 'loose' | 'shot' | 'pass' | 'smash' | 'inbound' | 'scored';
export type Mode =
  'idle' | 'post' | 'spin' | 'contest' | 'shoot' | 'down' | 'stun' | 'dunk' | 'exhausted';
export type Handling = 'hold' | 'dribble';
export type InboundStage = 'position' | 'pass';

export interface Fighter {
  x: number;
  z: number;
  energy: number;
  mode: Mode;
  angle: number;
  charge: number;
  timer: number;
  grace: number;
  spin: number;
  vx: number;
  vz: number;
  hand: number;
  defenseHands: DefensiveHands;
  defensePushAt: number;
  defensePushApplied: boolean;
  defensePushCooldown: number;
  lastQ: number;
  lastR: number;
  taps: number;
  prevQ: boolean;
  prevR: boolean;
  prevInbound: boolean;
  interceptUntil: number;
  prevX: number;
  aiClock: number;
  rest: boolean;
  clumsy: number;
  moving: number;
  cooldown: number;
  steal: number;
  flopClock: number;
  legend: Legend;
  /** A catch starts with a two-hand chest hold before a live dribble. */
  handling: Handling;
  /** Pending tap/hold classification while holding the ball. */
  dirHeld: number;
  pendingMoveX: number;
  pendingMoveZ: number;
  inputResetVersion: number;
  jab: number;
  jabX: number;
  jabZ: number;
  jabCd: number;
  bite: number;
  biteX: number;
  biteZ: number;
  holdClock: number;
  aiJab: boolean;
  /** World position between the palms, written by Character each frame. */
  grip: { x: number; y: number; z: number; ok: boolean };
  /** Last animated hand position relative to the rigid body's origin. */
  gripOffset: PassPoint;
  /** Controlled horizontal velocity, ramped toward the stick intent (heavy acceleration). */
  moveVX: number;
  moveVZ: number;
  /** Simulation time of this slot's last explicit inbound pass request. */
  passRequestAt: number;
}

export interface PhysicalInboundPass extends InboundPassPlan {
  receiver: PlayerSlot;
  elapsed: number;
  previousBall: PassPoint;
  previousReceiver: PassPoint;
  previousDefender: PassPoint;
  lastVelocity: PassPoint;
  enteredCourt: boolean;
  outcome: InboundPassOutcome;
  contact: 'backboard' | 'rim' | 'floor' | 'structure' | null;
}

export interface BallFlight {
  sx: number;
  sy: number;
  sz: number;
  tx: number;
  ty: number;
  tz: number;
  t: number;
  duration: number;
  arc: number;
  made: boolean;
  points: number;
  shooter: number;
  dunk: boolean;
}

export const INITIAL_MESSAGE = 'Big suits. Bigger problems.';
