/**
 * Heavy-body horizontal velocity: rate-limited approach toward the intended velocity.
 *
 * Accelerating (same direction, growing speed) takes `accelTime` seconds from rest to
 * `topSpeed`; slowing down or reversing uses the quicker `brakeTime`. The limit is a rate
 * (m/s per second), so the result is the same for any step size — no per-frame multiplier.
 * Mass is deliberately not an input: it stays a physics property (contacts, pushing).
 */
export function approachVelocity(
  current: { x: number; z: number },
  target: { x: number; z: number },
  topSpeed: number,
  accelTime: number,
  brakeTime: number,
  dt: number,
  out: { x: number; z: number },
): { x: number; z: number } {
  const dx = target.x - current.x,
    dz = target.z - current.z;
  const gap = Math.hypot(dx, dz);
  if (gap < 1e-9) {
    out.x = target.x;
    out.z = target.z;
    return out;
  }
  const accelerating =
    target.x * current.x + target.z * current.z >= 0 &&
    Math.hypot(target.x, target.z) >= Math.hypot(current.x, current.z);
  const rate = Math.max(0.01, topSpeed) / Math.max(1e-3, accelerating ? accelTime : brakeTime);
  const step = rate * dt;
  if (step >= gap) {
    out.x = target.x;
    out.z = target.z;
  } else {
    out.x = current.x + (dx / gap) * step;
    out.z = current.z + (dz / gap) * step;
  }
  return out;
}
