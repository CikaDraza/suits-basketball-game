import { clamp } from '../utils/math';

export interface PassPoint {
  x: number;
  y: number;
  z: number;
}
export type InboundPassType = 'chest' | 'lob';
export type InboundPassOutcome =
  'flying' | 'caught' | 'intercepted' | 'deflected' | 'missed' | 'out';

export interface PassingSettings {
  chestSpeed: number;
  minChestTime: number;
  maxChestTime: number;
  lobRise: number;
  lobClearance: number;
  denialLaneWidth: number;
  denialReceiverDistance: number;
  denialEndMargin: number;
  deepPaintRadius: number;
  boardOvershoot: number;
  boardAimAboveRim: number;
  boardLateralFactor: number;
}

export interface PassCourt {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  basket: PassPoint;
  boardX: number;
  boardHalfWidth: number;
}

export interface InboundPassPlan {
  type: InboundPassType;
  risky: boolean;
  source: PassPoint;
  /** Exact live hands position at release. The risky lob may overthrow this target. */
  target: PassPoint;
  aim: PassPoint;
  velocity: PassPoint;
  duration: number;
  apex: number;
}

export function isOnCourt(point: PassPoint, court: PassCourt): boolean {
  return (
    Number.isFinite(point.x) &&
    Number.isFinite(point.y) &&
    Number.isFinite(point.z) &&
    point.x >= court.minX &&
    point.x <= court.maxX &&
    point.z >= court.minZ &&
    point.z <= court.maxZ
  );
}

/** Projection onto the actual inbound-to-hands lane, independent of camera direction. */
export function passingLane(source: PassPoint, target: PassPoint, defender: PassPoint) {
  const dx = target.x - source.x,
    dz = target.z - source.z;
  const lengthSquared = dx * dx + dz * dz;
  const progress =
    lengthSquared > 1e-8
      ? ((defender.x - source.x) * dx + (defender.z - source.z) * dz) / lengthSquared
      : 0;
  const t = clamp(progress, 0, 1);
  return {
    progress,
    distance: Math.hypot(defender.x - source.x - dx * t, defender.z - source.z - dz * t),
    receiverDistance: Math.hypot(defender.x - target.x, defender.z - target.z),
  };
}

/** A release velocity that reaches the aim under Rapier's gravity after duration. */
export function ballisticVelocity(
  source: PassPoint,
  target: PassPoint,
  duration: number,
  gravity: PassPoint,
): PassPoint {
  return {
    x: (target.x - source.x) / duration - (gravity.x * duration) / 2,
    y: (target.y - source.y) / duration - (gravity.y * duration) / 2,
    z: (target.z - source.z) / duration - (gravity.z * duration) / 2,
  };
}

export function planInboundPass(
  source: PassPoint,
  receiver: PassPoint,
  hands: PassPoint,
  defender: PassPoint,
  defenderHeight: number,
  gravity: PassPoint,
  court: PassCourt,
  settings: PassingSettings,
): InboundPassPlan | null {
  if (!isOnCourt(receiver, court) || !isOnCourt(hands, court)) return null;
  const lane = passingLane(source, hands, defender);
  const fronting =
    lane.progress > settings.denialEndMargin &&
    lane.progress < 1 - settings.denialEndMargin &&
    lane.distance <= settings.denialLaneWidth &&
    lane.receiverDistance <= settings.denialReceiverDistance;
  const type = fronting && gravity.y < 0 ? 'lob' : 'chest';
  const risky =
    type === 'lob' &&
    Math.hypot(receiver.x - court.basket.x, receiver.z - court.basket.z) <=
      settings.deepPaintRadius;
  const target = { ...hands };
  const aim = risky
    ? {
        x: court.boardX - settings.boardOvershoot,
        y: court.basket.y + settings.boardAimAboveRim,
        z: clamp(
          receiver.z,
          -court.boardHalfWidth * settings.boardLateralFactor,
          court.boardHalfWidth * settings.boardLateralFactor,
        ),
      }
    : { ...target };
  let duration = clamp(
    Math.hypot(aim.x - source.x, aim.z - source.z) / settings.chestSpeed,
    settings.minChestTime,
    settings.maxChestTime,
  );
  let apex = Math.max(source.y, aim.y);
  if (type === 'lob') {
    apex = Math.max(
      Math.max(source.y, aim.y) + settings.lobRise,
      defenderHeight + settings.lobClearance,
    );
    // A risky deep-paint overthrow grazes the board, rather than sailing well over it.
    if (risky) apex = Math.max(source.y, aim.y) + settings.lobClearance;
    const gravityMagnitude = -gravity.y;
    duration =
      Math.sqrt((2 * (apex - source.y)) / gravityMagnitude) +
      Math.sqrt((2 * (apex - aim.y)) / gravityMagnitude);
  }
  const velocity = ballisticVelocity(source, aim, duration, gravity);
  if (type === 'chest' && gravity.y < 0) {
    const peakTime = clamp(-velocity.y / gravity.y, 0, duration);
    apex = source.y + velocity.y * peakTime + (gravity.y * peakTime * peakTime) / 2;
  }
  return { type, risky, source: { ...source }, target, aim, velocity, duration, apex };
}

/** Distance to the swept ball segment, not to its last rendered endpoint. */
export function sweptDistanceSquared(from: PassPoint, to: PassPoint, target: PassPoint): number {
  const dx = to.x - from.x,
    dy = to.y - from.y,
    dz = to.z - from.z;
  const lengthSquared = dx * dx + dy * dy + dz * dz;
  const t =
    lengthSquared > 1e-8
      ? clamp(
          ((target.x - from.x) * dx + (target.y - from.y) * dy + (target.z - from.z) * dz) /
            lengthSquared,
          0,
          1,
        )
      : 0;
  return (
    (from.x + dx * t - target.x) ** 2 +
    (from.y + dy * t - target.y) ** 2 +
    (from.z + dz * t - target.z) ** 2
  );
}

/** Sweep against the defender's moving, vertically bounded hand-reach volume. */
export function crossesDefenderReach(
  from: PassPoint,
  to: PassPoint,
  previous: PassPoint,
  current: PassPoint,
  lowerY: number,
  upperY: number,
  radius: number,
): boolean {
  const a = { x: from.x - previous.x, y: from.y, z: from.z - previous.z };
  const b = { x: to.x - current.x, y: to.y, z: to.z - current.z };
  let start = 0,
    end = 1;
  const dy = b.y - a.y;
  if (Math.abs(dy) < 1e-8) {
    if (a.y < lowerY - radius || a.y > upperY + radius) return false;
  } else {
    const first = (lowerY - radius - a.y) / dy,
      last = (upperY + radius - a.y) / dy;
    start = Math.max(0, Math.min(first, last));
    end = Math.min(1, Math.max(first, last));
    if (start > end) return false;
  }
  const dx = b.x - a.x,
    dz = b.z - a.z;
  const lengthSquared = dx * dx + dz * dz;
  const t =
    lengthSquared > 1e-8 ? clamp(-(a.x * dx + a.z * dz) / lengthSquared, start, end) : start;
  const y = a.y + dy * t;
  return (
    (a.x + dx * t) ** 2 + (a.z + dz * t) ** 2 + (y - clamp(y, lowerY, upperY)) ** 2 <=
    radius * radius
  );
}
