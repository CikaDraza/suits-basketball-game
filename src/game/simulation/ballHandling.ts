import { config, type Legend } from '../data/gameConfig';
import { clamp } from '../utils/math';
import type { PassPoint } from './tacticalPass';
import { createDribbleShape, writeDribbleShape, type DribbleShape } from './dribbleProfile';

export interface DribbleSkillRequest {
  kind?: 'side' | 'front' | 'behind';
  hand: 1 | -1;
  double?: boolean;
}

export interface DribbleSkill {
  kind: 'side' | 'front' | 'behind';
  started: boolean;
  completed: number;
  total: number;
  initialHand: number;
  targetHand: number;
}

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
  postBlend: number;
  pressureSide: number;
  pressureForward: number;
  shape: DribbleShape | null;
  skill: DribbleSkill | null;
  lastSkill: DribbleSkill | null;
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
    postBlend: 0,
    pressureSide: 0,
    pressureForward: 0,
    shape: null,
    skill: null,
    lastSkill: null,
  };
}

/** Queue a deliberate move; only a second rear flick can extend an active move. */
export function requestDribbleSkill(
  state: BallHandlingState,
  request: DribbleSkillRequest,
  initialHand: number,
): boolean {
  const kind = request.kind ?? 'side';
  if (state.skill) {
    if (kind !== 'behind' || !request.double || state.skill.kind !== 'behind') return false;
    if (state.skill.total === 3) return false;
    state.skill.total = 3;
    return true;
  }
  if (state.crossing) return false;
  const resume =
    kind === 'behind' &&
    request.double &&
    state.lastSkill?.kind === 'behind' &&
    state.lastSkill.total === 1
      ? state.lastSkill
      : null;
  if (resume) {
    // Keep the same command identity so its single movement-risk roll remains
    // authoritative when the second flick arrives just after the first catch.
    resume.total = 3;
    state.skill = resume;
    startSkillBounce(state);
    return true;
  }
  state.skill = {
    kind,
    started: false,
    completed: 0,
    total:
      kind === 'front' || (kind === 'behind' && request.double)
        ? 3
        : kind === 'side' && request.hand === initialHand
          ? 2
          : 1,
    initialHand,
    targetHand: kind === 'side' ? request.hand : -initialHand,
  };
  return true;
}

export function cancelDribbleSkill(state: BallHandlingState) {
  state.skill = null;
  state.lastSkill = null;
  state.crossing = false;
  state.fromHand = state.toHand = state.hand;
}

function startSkillBounce(state: BallHandlingState) {
  const skill = state.skill!;
  skill.started = true;
  state.fromHand = state.hand;
  state.toHand = skill.kind === 'side' ? skill.targetHand : -state.hand;
  state.crossing = state.fromHand !== state.toHand;
}

/** The same bounce clock drives the ball, hand contacts, and the entire combination. */
function advanceSkill(state: BallHandlingState, dt: number) {
  let remaining = Math.max(0, dt);
  while (remaining > 1e-9) {
    const period = state.skill?.started
      ? config.ballControl.skills.period
      : config.ballControl.period;
    const available = (1 - state.phase) * period;
    const elapsed = Math.min(remaining, available);
    const previous = state.phase;
    state.phase += elapsed / period;
    if (Math.abs(state.phase - 0.5) < 1e-9) state.phase = 0.5;
    if (previous < 0.5 && state.phase >= 0.5) {
      state.floorEvent = true;
      if (state.crossing) state.hand = state.toHand;
    }
    remaining -= elapsed;
    if (elapsed < available - 1e-9) break;
    state.phase = 0;
    if (state.crossing) state.hand = state.toHand;
    state.crossing = false;
    if (state.skill?.started) {
      state.skill.completed++;
      if (state.skill.completed >= state.skill.total) {
        state.lastSkill = state.skill;
        state.skill = null;
      }
    }
    if (state.skill) startSkillBounce(state);
  }
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
  defender?: Pick<PassPoint, 'x' | 'z'>,
): PassPoint {
  const cfg = config.ballControl,
    shape = cfg[legend];
  state.floorEvent = false;
  if (state.owner !== slot || state.mode !== mode) {
    if (state.owner !== slot) state.postBlend = 0;
    state.owner = slot;
    state.mode = mode;
    state.entryTime = 0;
    courtToLocal(current, body, angle, state.entry);
    if (mode === 'dribble') {
      state.phase = 0;
      state.hand = requestedHand;
      state.crossing = false;
      if (state.skill && !state.skill.started) startSkillBounce(state);
      else cancelDribbleSkill(state);
    } else cancelDribbleSkill(state);
    state.pressureSide = state.pressureForward = 0;
    state.shape ??= createDribbleShape(legend);
  }
  // The physical player remains authoritative; this only changes the controlled
  // ball's reachable spacing. Pressure can expose a hand, never select another.
  const blendK = 1 - Math.exp(-cfg.postDribble.blendRate * dt);
  state.postBlend += (Number(post) - state.postBlend) * blendK;
  let pressureSide = 0,
    pressureForward = 0;
  if (defender && post) {
    const dx = defender.x - body.x,
      dz = defender.z - body.z,
      distance = Math.hypot(dx, dz);
    const pressure = clamp(
      (cfg.postDribble.pressureRange - distance) /
        (cfg.postDribble.pressureRange - cfg.postDribble.fullPressureDistance),
      0,
      1,
    );
    if (distance > 1e-5) {
      const localX = dx * Math.cos(angle) - dz * Math.sin(angle),
        localZ = dx * Math.sin(angle) + dz * Math.cos(angle);
      const postShape = cfg.postDribble[legend];
      const ballDx = localX - state.hand * postShape.hipSide,
        ballDz = localZ - postShape.dribbleForward,
        ballDistance = Math.hypot(ballDx, ballDz);
      if (ballDistance > 1e-5) {
        pressureSide =
          (-ballDx / ballDistance) * state.hand * cfg.postDribble.pressureSide * pressure;
        pressureForward = (-ballDz / ballDistance) * cfg.postDribble.pressureForward * pressure;
      }
    }
  }
  state.pressureSide += (pressureSide - state.pressureSide) * blendK;
  state.pressureForward += (pressureForward - state.pressureForward) * blendK;
  state.shape ??= createDribbleShape(legend);
  writeDribbleShape(
    state.shape,
    legend,
    state.postBlend,
    state.pressureSide,
    state.pressureForward,
  );
  let x = 0,
    y = shape.holdHeight - (post ? shape.postDrop : 0),
    z = shape.holdForward;
  if (mode === 'dribble' && charge === 0) {
    const previous = state.phase;
    if (state.skill) advanceSkill(state, dt);
    else {
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
    }
    const across = state.crossing ? smoothUnit(state.phase) : 0;
    const side = state.crossing
      ? state.fromHand + (state.toHand - state.fromHand) * across
      : state.hand;
    x = state.shape.hipSide * side;
    y = dribbleHeight(state.phase, state.shape.dribbleTop, config.ball.radius);
    z =
      state.shape.dribbleForward +
      (state.crossing ? Math.sin(state.phase * Math.PI) * cfg.crossoverForward : 0);
    if (state.skill?.started) {
      const outward = Math.sin(state.phase * Math.PI) ** 2;
      if (state.skill.kind === 'side' && !state.crossing)
        x += state.hand * cfg.skills.sideReach * outward;
      if (state.skill.kind === 'behind') {
        z =
          state.shape.dribbleForward +
          (cfg.skills.behindForward - state.shape.dribbleForward) * outward;
        // The release and catch stay outside the hips while the free ball crosses behind.
        x += state.fromHand * cfg.skills.sideReach * Math.sin(2 * Math.PI * state.phase);
      }
    }
    if (!state.skill && state.crossing && previous < 0.5 && state.phase >= 0.5)
      state.hand = state.toHand;
  } else if (charge > 0) {
    y +=
      (config.player[legend].height - config.ball.foreheadOffset - y) *
      clamp(charge / config.shots.perfectTime, 0, 1);
    z = shape.holdForward;
  }
  // A quick entry must finish before the first floor contact, even when the
  // move starts from the two-hand chest hold rather than an existing dribble.
  const entryDuration = state.skill?.started
    ? Math.min(cfg.transitionTime, Math.max(1e-6, cfg.skills.period * 0.5 - dt))
    : cfg.transitionTime;
  const blend = smoothUnit(state.entryTime / entryDuration);
  state.local.x = state.entry.x + (x - state.entry.x) * blend;
  state.local.y = state.entry.y + (y - state.entry.y) * blend;
  state.local.z = state.entry.z + (z - state.entry.z) * blend;
  state.entryTime += dt;
  return localToCourt(state.local, body, angle, state.position);
}
