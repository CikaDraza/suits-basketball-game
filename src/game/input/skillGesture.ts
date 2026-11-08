import { createMovementTransform } from '../simulation/coordinates';

export interface SkillVector {
  x: number;
  /** Positive points up the screen, like the existing movement stick plane. */
  z: number;
}

export interface SkillGestureThresholds {
  activate?: number;
  release?: number;
  lateral?: number;
  /** Ground-depth compression in the locked gameplay camera, sin(camera pitch). */
  verticalScale?: number;
}

export interface HandGesture {
  hand: 1 | -1;
  /** Body orientation captured at activation, never reinterpreted while held. */
  facing: number;
  sequence: number;
}

export const SKILL_GESTURE_DEFAULTS = {
  activate: 0.65,
  release: 0.25,
  lateral: 0.25,
} as const;

/** One skill command per neutral → deliberate direction gesture; no body transform writes. */
export function createSkillGesture(cameraAngle: number, thresholds: SkillGestureThresholds = {}) {
  const movement = createMovementTransform(cameraAngle);
  const activate = thresholds.activate ?? SKILL_GESTURE_DEFAULTS.activate;
  const release = thresholds.release ?? SKILL_GESTURE_DEFAULTS.release;
  const lateral = thresholds.lateral ?? SKILL_GESTURE_DEFAULTS.lateral;
  const verticalScale = thresholds.verticalScale ?? 1;
  let armed = false;
  let sequence = 0;
  return {
    reset() {
      armed = false;
    },
    sample(vector: SkillVector, facing: number): HandGesture | null {
      if (!Number.isFinite(vector.x) || !Number.isFinite(vector.z) || !Number.isFinite(facing)) {
        armed = false;
        return null;
      }
      const magnitude = Math.hypot(vector.x, vector.z);
      if (magnitude <= release) {
        armed = true;
        return null;
      }
      if (!armed || magnitude < activate) return null;
      // Even an ambiguous gesture consumes this deflection: turning while held
      // cannot turn a rejected forward/backward command into a different action.
      armed = false;
      const right = movement.worldToStick(-Math.cos(facing), Math.sin(facing));
      right.z *= verticalScale;
      const length = Math.hypot(right.x, right.z);
      const side = (vector.x * right.x + vector.z * right.z) / (magnitude * length);
      if (!Number.isFinite(side) || Math.abs(side) <= lateral) return null;
      return { hand: side > 0 ? -1 : 1, facing, sequence: ++sequence };
    },
  };
}
