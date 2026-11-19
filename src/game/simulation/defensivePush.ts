import { config } from '../data/gameConfig';

type Point = { x: number; z: number };
export interface ForearmContactSample {
  time: number;
  actor: Point;
  opponent: Point | null;
  mode: string;
  valid: boolean;
  targetDistance: number | null;
}
/** Final rendered forearms supply measured reach; capsule range/angle still gate every hit. */
export const forearmContacts: (ForearmContactSample | null)[] = [null, null];
export function hasMeasuredForearmContact(
  sample: ForearmContactSample | null,
  time: number,
  actor: Point,
  opponent: Point,
) {
  const tolerance = config.defense.hands.forearmContactTolerance;
  return (
    !!sample &&
    (sample.mode === 'brace' || sample.mode === 'push') &&
    sample.valid &&
    sample.targetDistance !== null &&
    Number.isFinite(sample.targetDistance) &&
    sample.targetDistance <= tolerance &&
    time >= sample.time &&
    time - sample.time < 0.25 &&
    sample.opponent !== null &&
    Math.hypot(actor.x - sample.actor.x, actor.z - sample.actor.z) < tolerance &&
    Math.hypot(opponent.x - sample.opponent.x, opponent.z - sample.opponent.z) < tolerance
  );
}
export interface PushEvidence {
  requestedAt: number;
  gestureAccepted: boolean;
  animationPerformed: boolean;
  withinRange: boolean;
  contactEstablished: boolean;
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
  return { x: fx * speed, z: fz * speed };
}
