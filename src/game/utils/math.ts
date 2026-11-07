export interface PointXZ {
  readonly x: number;
  readonly z: number;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function distanceXZ(a: PointXZ, b: PointXZ): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

/** Frame-rate independent interpolation factor for an exponential decay. */
export function dampingFactor(rate: number, delta: number): number {
  return 1 - Math.exp(-rate * delta);
}
