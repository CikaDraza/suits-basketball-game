import { createSkillGesture, SKILL_GESTURE_DEFAULTS, type HandGesture } from './skillGesture';

interface SkillSample {
  device: string | null;
  version: number;
  vector: { x: number; z: number };
  hand: number;
  facing: number;
  enabled: boolean;
  eligible: boolean;
  crossing: boolean;
}

/** Preserve sampled skill edges until physics consumes them; movement has no path into this buffer. */
export function createDribbleSkillBuffer(cameraAngle: number, verticalScale: number) {
  const gesture = createSkillGesture(cameraAngle, { verticalScale });
  let device: string | null = null;
  let version = -1;
  let previousHand = 0;
  let ready = false;
  const pending: HandGesture[] = [];
  const debug = { activations: 0, rejected: 0, last: null as HandGesture | null, pending: 0 };
  const clear = () => {
    gesture.reset();
    previousHand = 0;
    ready = false;
    pending.length = 0;
    debug.pending = 0;
  };
  return {
    debug,
    sample(sample: SkillSample) {
      if (sample.device !== device || sample.version !== version) {
        clear();
        device = sample.device;
        version = sample.version;
        debug.activations = debug.rejected = 0;
        debug.last = null;
      }
      if (!sample.enabled || !sample.device) {
        clear();
        return;
      }
      if (
        sample.hand === 0 &&
        Math.hypot(sample.vector.x, sample.vector.z) <= SKILL_GESTURE_DEFAULTS.release
      )
        ready = true;
      const directional = gesture.sample(sample.vector, sample.facing);
      const direct = sample.hand !== 0 && sample.hand !== previousHand;
      previousHand = sample.hand;
      const event =
        direct && ready
          ? { hand: sample.hand as 1 | -1, facing: sample.facing, sequence: debug.activations + 1 }
          : directional;
      if (!sample.eligible || sample.crossing) {
        if (pending.length && sample.crossing) debug.rejected++;
        pending.length = 0;
        debug.pending = 0;
      }
      if (!event) return;
      debug.activations++;
      debug.last = { ...event, sequence: debug.activations };
      if (sample.crossing) {
        debug.rejected++;
        return;
      }
      if (sample.eligible) {
        // The latest request can replace an uncommitted request. A committed cross rejects new input.
        pending.length = 0;
        pending.push(debug.last);
        debug.pending = 1;
      }
    },
    take() {
      const event = pending.pop() ?? null;
      debug.pending = 0;
      return event;
    },
  };
}
