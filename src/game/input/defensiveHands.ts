import {
  createSkillGesture,
  resolveSkillDirection,
  SKILL_GESTURE_DEFAULTS,
  type SkillVector,
  type HandGesture,
} from './skillGesture';

export type DefensiveHands = 'none' | 'left' | 'right' | 'wide' | 'up' | 'wave' | 'brace' | 'push';
export type DefensiveArmMode = DefensiveHands | 'ready';

/** Neutral releases an accepted action; held input preserves its anatomical side. */
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
  if (
    ![magnitude, facing, cameraAngle, verticalScale].every(Number.isFinite) ||
    verticalScale <= 0 ||
    (previous === 'none' ? magnitude < threshold : magnitude <= threshold)
  )
    return 'none';
  if (previous !== 'none') return previous;
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
    lastKind = '',
    lastAt = -Infinity,
    previousTime = -Infinity;
  let pending: { facing: number; time: number } | null = null;
  const debug = {
    locked: 'none' as DefensiveHands,
    facing: null as number | null,
    cameraAngle: null as number | null,
    phase: 'neutral-required' as 'neutral-required' | 'armed' | 'held',
    last: null as HandGesture | null,
  };
  const clear = () => {
    gesture.reset();
    debug.locked = 'none';
    debug.facing = debug.cameraAngle = null;
    debug.phase = 'neutral-required';
    debug.last = null;
    lastKind = '';
    lastAt = previousTime = -Infinity;
    pending = null;
  };
  return {
    debug,
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
      if (
        !sample.enabled ||
        !sample.device ||
        ![
          sample.time,
          sample.vector.x,
          sample.vector.z,
          sample.facing,
          sample.cameraAngle,
          sample.verticalScale,
        ].every(Number.isFinite) ||
        sample.verticalScale <= 0
      ) {
        clear();
        return 'none';
      }
      if (sample.time < previousTime) clear();
      previousTime = sample.time;
      const event = gesture.sample(sample.vector, sample.facing, sample);
      if (Math.hypot(sample.vector.x, sample.vector.z) <= SKILL_GESTURE_DEFAULTS.release) {
        debug.locked = 'none';
        debug.facing = debug.cameraAngle = null;
      }
      if (event) {
        const double = event.kind === lastKind && sample.time - lastAt <= doubleWindow;
        debug.locked =
          event.kind === 'front'
            ? double
              ? 'wave'
              : 'up'
            : event.kind === 'behind'
              ? 'brace'
              : event.hand === 1
                ? 'left'
                : 'right';
        debug.facing = event.facing;
        debug.cameraAngle = sample.cameraAngle;
        debug.last = event;
        if (double && event.kind === 'behind')
          pending = { facing: event.facing, time: sample.time };
        lastKind = double ? '' : event.kind;
        lastAt = double ? -Infinity : sample.time;
      }
      debug.phase = debug.locked !== 'none' ? 'held' : gesture.armed ? 'armed' : 'neutral-required';
      return debug.locked;
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
