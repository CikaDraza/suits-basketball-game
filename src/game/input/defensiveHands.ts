import {
  createSkillGesture,
  resolveSkillDirection,
  SKILL_GESTURE_DEFAULTS,
  type SkillVector,
} from './skillGesture';

export type DefensiveHands = 'none' | 'left' | 'right' | 'up' | 'wave' | 'brace' | 'push';

/** Held input: follow the current body/camera frame, rather than queueing a dribble edge. */
export function readDefensiveHands(
  vector: SkillVector,
  facing: number,
  cameraAngle: number,
  verticalScale: number,
  previous: DefensiveHands = 'none',
): DefensiveHands {
  const magnitude = Math.hypot(vector.x, vector.z);
  const threshold =
    previous === 'none' ? SKILL_GESTURE_DEFAULTS.activate : SKILL_GESTURE_DEFAULTS.release;
  if (!Number.isFinite(magnitude) || magnitude <= threshold) return 'none';
  const direction = resolveSkillDirection(vector, facing, cameraAngle, verticalScale);
  if (!direction) return 'none';
  return direction.kind === 'front'
    ? 'up'
    : direction.kind === 'behind'
      ? 'brace'
      : direction.hand === 1
        ? 'left'
        : 'right';
}

export function createDefensiveHandInput(doubleWindow: number) {
  const gesture = createSkillGesture(0);
  let identity = '',
    previous: DefensiveHands = 'none',
    lastKind = '',
    lastAt = -Infinity;
  let waving = false;
  let pending: { facing: number; time: number } | null = null;
  const clear = () => {
    gesture.reset();
    previous = 'none';
    lastKind = '';
    lastAt = -Infinity;
    waving = false;
    pending = null;
  };
  return {
    sample(sample: {
      device: string | null;
      version: number;
      enabled: boolean;
      time: number;
      vector: SkillVector;
      facing: number;
      cameraAngle: number;
      verticalScale: number;
    }): DefensiveHands {
      const nextIdentity = JSON.stringify([sample.device, sample.version]);
      if (nextIdentity !== identity) {
        clear();
        identity = nextIdentity;
      }
      if (!sample.enabled || !sample.device || !Number.isFinite(sample.time)) {
        clear();
        return 'none';
      }
      if (sample.time < lastAt) clear();
      const held = readDefensiveHands(
        sample.vector,
        sample.facing,
        sample.cameraAngle,
        sample.verticalScale,
        previous,
      );
      previous = held;
      if (held !== 'up') waving = false;
      const event = gesture.sample(sample.vector, sample.facing, sample);
      if (event) {
        const double = event.kind === lastKind && sample.time - lastAt <= doubleWindow;
        if (double && event.kind === 'front') waving = true;
        if (double && event.kind === 'behind')
          pending = { facing: event.facing, time: sample.time };
        lastKind = double ? '' : event.kind;
        lastAt = double ? -Infinity : sample.time;
      }
      return held === 'up' && waving ? 'wave' : held;
    },
    takePush(time: number) {
      const event = pending;
      pending = null;
      return event && time >= event.time && time - event.time <= doubleWindow ? event : null;
    },
  };
}

export function hasRaisedDefensiveHands(hands: DefensiveHands) {
  return hands === 'up' || hands === 'wave';
}
