import { createMovementTransform } from '../simulation/coordinates';

export interface SkillVector {
  x: number;
  /** Positive points up the screen, like the existing movement stick plane. */
  z: number;
}

export interface SkillGestureThresholds {
  activate?: number;
  release?: number;
  /** Ground-depth compression in the locked gameplay camera, sin(camera pitch). */
  verticalScale?: number;
}

export type DribbleSkillKind = 'side' | 'front' | 'behind';

export interface HandGesture {
  kind: DribbleSkillKind;
  /** Anatomical target for side gestures; front/behind retain the ball's current hand. */
  hand: 1 | -1;
  /** Body orientation captured at activation, never reinterpreted while held. */
  facing: number;
  sequence: number;
  /** Two distinct rear flicks, separated by neutral, inside the combination window. */
  double?: boolean;
}

export const SKILL_GESTURE_DEFAULTS = {
  activate: 0.65,
  release: 0.25,
  doubleFlickWindow: 0.32,
} as const;

/** Shared camera/body projection for dribble gestures and held defensive poses. */
export function resolveSkillDirection(vector: SkillVector, facing: number, yaw: number, pitch = 1) {
  if (![vector.x, vector.z, facing, yaw, pitch].every(Number.isFinite) || pitch <= 0) return null;
  const world = createMovementTransform(yaw).stickToWorld(vector.x, vector.z / pitch);
  const side = -world.x * Math.cos(facing) + world.z * Math.sin(facing);
  const forward = world.x * Math.sin(facing) + world.z * Math.cos(facing);
  const kind: DribbleSkillKind =
    Math.abs(forward) > Math.abs(side) + 1e-9 ? (forward > 0 ? 'front' : 'behind') : 'side';
  return { kind, hand: (side > 0 ? -1 : 1) as 1 | -1 };
}

/** One skill command per neutral → deliberate direction gesture; no body transform writes. */
export function createSkillGesture(cameraAngle: number, thresholds: SkillGestureThresholds = {}) {
  const activate = thresholds.activate ?? SKILL_GESTURE_DEFAULTS.activate;
  const release = thresholds.release ?? SKILL_GESTURE_DEFAULTS.release;
  const verticalScale = thresholds.verticalScale ?? 1;
  let armed = false;
  let sequence = 0;
  return {
    reset() {
      armed = false;
    },
    sample(
      vector: SkillVector,
      facing: number,
      camera: { cameraAngle?: number; verticalScale?: number } = {},
    ): HandGesture | null {
      const yaw = camera.cameraAngle ?? cameraAngle;
      const pitch = camera.verticalScale ?? verticalScale;
      if (
        !Number.isFinite(vector.x) ||
        !Number.isFinite(vector.z) ||
        !Number.isFinite(facing) ||
        !Number.isFinite(yaw) ||
        !Number.isFinite(pitch) ||
        pitch <= 0
      ) {
        armed = false;
        return null;
      }
      const magnitude = Math.hypot(vector.x, vector.z);
      if (magnitude <= release) {
        armed = true;
        return null;
      }
      if (!armed || magnitude < activate) return null;
      armed = false;
      // Undo the camera's compressed ground depth before resolving the body's
      // axes. Projected forward and right are not orthogonal on a tilted camera.
      return {
        ...resolveSkillDirection(vector, facing, yaw, pitch)!,
        facing,
        sequence: ++sequence,
      };
    },
  };
}
