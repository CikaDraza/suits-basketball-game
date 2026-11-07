import { COURT, LINE_EDGE } from './constants';

export type Boundary = 'baseline' | 'halfcourt' | 'sideline-left' | 'sideline-right';

const { LENGTH: L, HALF_WIDTH: HW } = COURT;

/** True when (x,z) lies completely beyond the OUTER edge of any boundary line. */
export const isBeyondBoundary = (x: number, z: number) =>
  x < -LINE_EDGE || x > L + LINE_EDGE || Math.abs(z) > HW + LINE_EDGE;

/** True when a point touches a line (lines are out) or lies beyond it. */
export const touchesOrBeyond = (x: number, z: number) =>
  x <= LINE_EDGE || x >= L - LINE_EDGE || Math.abs(z) >= HW - LINE_EDGE;

export function nearestBoundary(x: number, z: number): Boundary {
  const d = { baseline: Math.abs(x), halfcourt: Math.abs(L - x), 'sideline-left': Math.abs(-HW - z), 'sideline-right': Math.abs(HW - z) };
  return (Object.keys(d) as Boundary[]).reduce((a, b) => (d[a] <= d[b] ? a : b));
}

/** Inbound spots stay on the sidelines, clear of the rim zone and the center line. */
export const INBOUND = {
  MIN_X: 3.0,               // never under/behind the rim
  MAX_X: L - 0.6,
  OFFSET: 0.35,             // stand just outside the sideline
  TIME_LIMIT_MS: 10_000,
};

/** Nearest legal sideline throw-in spot for a violation at (x,z). Returns [x, y, z]. */
export function nearestSidelineSpot(x: number, z: number): [number, number, number] {
  const side = z >= 0 ? 1 : -1;
  const sx = Math.min(INBOUND.MAX_X, Math.max(INBOUND.MIN_X, x));
  return [sx, 0, side * (HW + LINE_EDGE + INBOUND.OFFSET)];
}
