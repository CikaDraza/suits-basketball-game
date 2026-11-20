import { config } from '../data/gameConfig';

type Point = { x: number; z: number };
type Point3 = Point & { y: number };
export interface TorsoBody extends Point {
  y?: number;
  angle?: number;
  legend: 'shaq' | 'chuck';
  mode?: string;
}
interface ForearmSegment {
  elbow: Point3;
  wrist: Point3;
}
export interface ForearmContactSample {
  time: number;
  actor: Point3 & { angle: number };
  mode: 'brace' | 'push';
  arms: ForearmSegment[];
}

/** Torso center above the actual capsule support plane. */
export function torsoCenterY(body: TorsoBody) {
  const capsuleHeight = config.physics.halfHeight + config.physics.radius;
  const pose = config.ballControl[body.legend];
  return (
    (body.y ?? capsuleHeight) -
    capsuleHeight +
    pose.holdHeight * config.defense.hands.braceTorsoHeight -
    (body.mode === 'post' ? pose.postDrop : 0)
  );
}

/** Distance from a measured forearm segment to the opponent's oriented lower torso. */
export function forearmTorsoGap(
  { elbow, wrist }: ForearmSegment,
  body: TorsoBody,
  dx = 0,
  dy = 0,
  dz = 0,
  closest?: Point3,
) {
  const radius = config.physics.radius;
  const torsoY = torsoCenterY(body);
  const angle = body.angle ?? 0;
  const c = Math.cos(angle),
    s = Math.sin(angle);
  let gap = Infinity;
  // Eight subdivisions keep sample spacing below sleeve thickness on both rigs.
  for (let i = 0; i <= 8; i++) {
    const f = i / 8;
    const x = elbow.x + (wrist.x - elbow.x) * f + dx;
    const y = elbow.y + (wrist.y - elbow.y) * f + dy;
    const z = elbow.z + (wrist.z - elbow.z) * f + dz;
    const rx = x - body.x,
      rz = z - body.z;
    const localX = (rx * c - rz * s) / (radius * 0.95);
    const localZ = (rx * s + rz * c) / (radius * 0.8);
    const horizontal = Math.hypot(localX, localZ);
    const sideGap = horizontal > 1 ? Math.hypot(rx, rz) * (1 - 1 / horizontal) : 0;
    const verticalGap = Math.max(0, Math.abs(y - torsoY) - radius * 0.36);
    const distance = Math.hypot(sideGap, verticalGap);
    if (distance >= gap) continue;
    gap = distance;
    if (closest) {
      closest.x = x;
      closest.y = y;
      closest.z = z;
    }
  }
  return gap;
}

export const forearmContacts: (ForearmContactSample | null)[] = [null, null];

export function measuredForearmGap(
  sample: ForearmContactSample | null,
  time: number,
  actor: ForearmContactSample['actor'],
  opponent: TorsoBody,
  mode: ForearmContactSample['mode'],
): number | null {
  if (
    !sample ||
    sample.mode !== mode ||
    sample.arms.length === 0 ||
    time < sample.time ||
    time - sample.time > config.defense.hands.contactSampleAge ||
    Math.cos(actor.angle - sample.actor.angle) < 0.94
  )
    return null;
  const dx = actor.x - sample.actor.x,
    dy = actor.y - sample.actor.y,
    dz = actor.z - sample.actor.z;
  // Translate a fresh measured segment with the body. A reset/teleport needs a new sample.
  if (Math.hypot(dx, dy, dz) > config.defense.hands.contactSampleTravel) return null;
  return Math.min(...sample.arms.map((arm) => forearmTorsoGap(arm, opponent, dx, dy, dz)));
}

export interface PushEvidence {
  requestedAt: number;
  gestureAccepted: boolean;
  animationPerformed: boolean;
  withinRange: boolean;
  contactEstablished: boolean;
  measuredGap?: number | null;
  result?:
    | 'hit'
    | 'out-of-range-or-facing'
    | 'no-fresh-forearm'
    | 'forearm-out-of-reach'
    | 'unavailable'
    | 'no-opponent';
  impulseApplied: boolean;
  target: number | null;
  origin: Point | null;
  displacement: number;
  velocityBefore: Point | null;
  measuredVelocity: Point | null;
  requestedDeltaVelocity: Point | null;
}
export const pushEvidence: (PushEvidence | null)[] = [null, null];

/** A shove reaches only the opponent in front; its velocity respects the mass ratio. */
export function defensivePushImpulse(
  from: { x: number; z: number; angle: number; mass: number },
  target: { x: number; z: number; mass: number },
) {
  const dx = target.x - from.x,
    dz = target.z - from.z;
  const distance = Math.hypot(dx, dz);
  const settings = config.defense.hands;
  const fx = Math.sin(from.angle),
    fz = Math.cos(from.angle);
  if (
    distance < 1e-5 ||
    distance > settings.pushRange ||
    (dx * fx + dz * fz) / distance < settings.pushMinFacing
  )
    return null;
  const speed = (settings.pushSpeed * from.mass) / target.mass;
  return { x: (dx / distance) * speed, z: (dz / distance) * speed };
}
