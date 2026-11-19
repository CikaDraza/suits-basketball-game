type Point = { x: number; z: number };

/** Explicit off-ball stance faces a physical opponent; no camera enters this calculation. */
export function defensiveStanceYaw(player: Point, opponent: Point | null): number | null {
  if (!opponent) return null;
  const dx = opponent.x - player.x,
    dz = opponent.z - player.z;
  return Math.hypot(dx, dz) > 1e-5 ? Math.atan2(dx, dz) : null;
}
