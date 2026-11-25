export interface SkillVector {
  x: number;
  /** Positive points up the screen, like the existing movement stick plane. */
  z: number;
}

export interface SkillGestureThresholds {
  activate?: number;
  release?: number;
  /** Screen projection of body-forward, sin(camera pitch); never scales the stick itself. */
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

/**
 * Right stick = screen intent. Project body-forward with the rendered camera,
 * then use orthogonal 90-degree sectors around that visible heading. Do not
 * inverse-project the stick: a shallow broadcast camera would shrink side sectors.
 * Left-stick locomotion deliberately keeps its existing independent reference.
 */
export function resolveSkillFrame(vector: SkillVector, facing: number, yaw: number, pitch = 1) {
  if (![vector.x, vector.z, facing, yaw, pitch].every(Number.isFinite) || pitch <= 0) return null;
  const magnitude = Math.hypot(vector.x, vector.z);
  if (magnitude < 1e-12) return null;
  const delta = facing - yaw;
  const fx = Math.sin(delta),
    fz = -Math.min(1, pitch) * Math.cos(delta);
  const length = Math.hypot(fx, fz);
  const screenForward = { x: fx / length, z: fz / length };
  const normalized = { x: vector.x / magnitude, z: vector.z / magnitude };
  const left = -screenForward.z * normalized.x + screenForward.x * normalized.z;
  const forward = screenForward.x * normalized.x + screenForward.z * normalized.z;
  const kind: DribbleSkillKind =
    Math.abs(forward) > Math.abs(left) + 1e-9 ? (forward > 0 ? 'front' : 'behind') : 'side';
  return {
    screenForward,
    normalized,
    body: { left, forward },
    kind,
    hand: (left < 0 ? -1 : 1) as 1 | -1,
  };
}

export function resolveSkillDirection(vector: SkillVector, facing: number, yaw: number, pitch = 1) {
  const frame = resolveSkillFrame(vector, facing, yaw, pitch);
  return frame ? { kind: frame.kind, hand: frame.hand } : null;
}

/** One skill command per neutral → deliberate direction gesture; no body transform writes. */
export function createSkillGesture(cameraAngle: number, thresholds: SkillGestureThresholds = {}) {
  const activate = thresholds.activate ?? SKILL_GESTURE_DEFAULTS.activate;
  const release = thresholds.release ?? SKILL_GESTURE_DEFAULTS.release;
  const verticalScale = thresholds.verticalScale ?? 1;
  let armed = false;
  let sequence = 0;
  return {
    get armed() {
      return armed;
    },
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
      return {
        ...resolveSkillDirection(vector, facing, yaw, pitch)!,
        facing,
        sequence: ++sequence,
      };
    },
  };
}
