import { config } from '../data/gameConfig';

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
