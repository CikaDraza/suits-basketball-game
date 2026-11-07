import { config, type Legend } from '../data/gameConfig';
import { clamp } from '../utils/math';
import type { PassPoint } from './tacticalPass';

export interface BallHandlingState {
  owner: number;
  mode: 'hold' | 'dribble';
  phase: number;
  hand: number;
  crossing: boolean;
  fromHand: number;
  toHand: number;
  entryTime: number;
  entry: PassPoint;
  local: PassPoint;
  position: PassPoint;
  floorEvent: boolean;
  floorContacts: number;
  lastFloorY: number | null;
}
export function createBallHandlingState(): BallHandlingState {
  return {
    owner: -1,
    mode: 'hold',
    phase: 0,
    hand: 1,
    crossing: false,
    fromHand: 1,
    toHand: 1,
    entryTime: 0,
    entry: { x: 0, y: 0, z: 0 },
    local: { x: 0, y: 0, z: 0 },
    position: { x: 0, y: 0, z: 0 },
    floorEvent: false,
    floorContacts: 0,
    lastFloorY: null,
  };
}
export function smoothUnit(t: number) {
  const u = clamp(t, 0, 1);
  return u * u * (3 - 2 * u);
}
export function localToCourt(
  local: PassPoint,
  body: PassPoint,
  angle: number,
  out: PassPoint,
): PassPoint {
  const s = Math.sin(angle),
    c = Math.cos(angle);
  out.x = body.x + c * local.x + s * local.z;
  out.y = body.y - config.physics.halfHeight - config.physics.radius + local.y;
  out.y = Math.max(config.ball.radius, out.y);
  out.z = body.z - s * local.x + c * local.z;
  return out;
}
export function courtToLocal(
  point: PassPoint,
  body: PassPoint,
  angle: number,
  out: PassPoint,
): PassPoint {
  const s = Math.sin(angle),
    c = Math.cos(angle),
    dx = point.x - body.x,
    dz = point.z - body.z;
  out.x = c * dx - s * dz;
  out.z = s * dx + c * dz;
  out.y = point.y - body.y + config.physics.halfHeight + config.physics.radius;
  return out;
}
export function protectedBallTarget(
  legend: Legend,
  body: PassPoint,
  angle: number,
  post: boolean,
  out: PassPoint,
): PassPoint {
  const settings = config.ballControl[legend];
  return localToCourt(
    { x: 0, y: settings.holdHeight - (post ? settings.postDrop : 0), z: settings.holdForward },
    body,
    angle,
    out,
  );
}
export function dribbleHeight(phase: number, top: number, radius: number): number {
  const p = ((phase % 1) + 1) % 1;
  if (p < 0.5) return top - (top - radius) * (2 * p) ** 2;
  const t = (p - 0.5) * 2;
  return radius + (top - radius) * (2 * t - t * t);
}
export function stepBallHandling(
  state: BallHandlingState,
  slot: number,
  legend: Legend,
  body: PassPoint,
  angle: number,
  mode: 'hold' | 'dribble',
  requestedHand: number,
  post: boolean,
  charge: number,
  current: PassPoint,
  dt: number,
): PassPoint {
  const cfg = config.ballControl,
    shape = cfg[legend];
  state.floorEvent = false;
  if (state.owner !== slot || state.mode !== mode) {
    state.owner = slot;
    state.mode = mode;
    state.entryTime = 0;
    courtToLocal(current, body, angle, state.entry);
    if (mode === 'dribble') {
      state.phase = 0;
      state.hand = requestedHand;
      state.crossing = false;
    }
  }
  let x = 0,
    y = shape.holdHeight - (post ? shape.postDrop : 0),
    z = shape.holdForward;
  if (mode === 'dribble' && charge === 0) {
    const previous = state.phase;
    state.phase = (state.phase + dt / cfg.period) % 1;
    state.floorEvent = previous < 0.5 && state.phase >= 0.5;
    if (state.phase < previous) {
      if (state.crossing) {
        state.hand = state.toHand;
        state.crossing = false;
      }
      if (requestedHand !== state.hand) {
        state.crossing = true;
        state.fromHand = state.hand;
        state.toHand = requestedHand;
      }
    }
    const across = state.crossing ? smoothUnit(state.phase) : 0;
    const side = state.crossing
      ? state.fromHand + (state.toHand - state.fromHand) * across
      : state.hand;
    x = shape.hipSide * side;
    y = dribbleHeight(state.phase, shape.dribbleTop, config.ball.radius);
    z =
      shape.dribbleForward +
      (state.crossing ? Math.sin(state.phase * Math.PI) * cfg.crossoverForward : 0);
    if (state.crossing && previous < 0.5 && state.phase >= 0.5) state.hand = state.toHand;
  } else if (charge > 0) {
    y +=
      (config.player[legend].height - config.ball.foreheadOffset - y) *
      clamp(charge / config.shots.perfectTime, 0, 1);
    z = shape.holdForward;
  }
  const blend = smoothUnit(state.entryTime / cfg.transitionTime);
  state.local.x = state.entry.x + (x - state.entry.x) * blend;
  state.local.y = state.entry.y + (y - state.entry.y) * blend;
  state.local.z = state.entry.z + (z - state.entry.z) * blend;
  state.entryTime += dt;
  return localToCourt(state.local, body, angle, state.position);
}
