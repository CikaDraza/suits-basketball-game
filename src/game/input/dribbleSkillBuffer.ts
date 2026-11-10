import {
  createSkillGesture,
  SKILL_GESTURE_DEFAULTS,
  type DribbleSkillKind,
  type HandGesture,
} from './skillGesture';

interface SkillSample {
  device: string | null;
  version: number;
  vector: { x: number; z: number };
  hand: number;
  facing: number;
  enabled: boolean;
  eligible: boolean;
  crossing: boolean;
  crossingKind?: DribbleSkillKind | null;
  /** Simulation clock, in seconds. */
  time?: number;
  cameraAngle?: number;
  verticalScale?: number;
}

/** Preserve sampled skill edges until physics consumes them; movement has no path into this buffer. */
export function createDribbleSkillBuffer(
  cameraAngle: number,
  verticalScale: number,
  doubleFlickWindow: number = SKILL_GESTURE_DEFAULTS.doubleFlickWindow,
) {
  const gesture = createSkillGesture(cameraAngle, { verticalScale });
  let device: string | null = null;
  let version = -1;
  let previousHand = 0;
  let ready = false;
  let lastBehindAt = -Infinity;
  let previousTime = -Infinity;
  const pending: HandGesture[] = [];
  const debug = {
    activations: 0,
    rejected: 0,
    last: null as HandGesture | null,
    accepted: null as HandGesture | null,
    pending: 0,
  };
  const clear = () => {
    gesture.reset();
    previousHand = 0;
    ready = false;
    lastBehindAt = previousTime = -Infinity;
    pending.length = 0;
    debug.pending = 0;
    debug.accepted = null;
  };
  return {
    debug,
    get armed() {
      return gesture.armed;
    },
    get phase(): 'neutral-required' | 'armed' | 'held' {
      return !ready ? 'neutral-required' : gesture.armed ? 'armed' : 'held';
    },
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
      const time = sample.time ?? performance.now() / 1000;
      if (!Number.isFinite(time) || time < previousTime) lastBehindAt = -Infinity;
      previousTime = time;
      const directional = gesture.sample(sample.vector, sample.facing, sample);
      const direct = sample.hand !== 0 && sample.hand !== previousHand;
      previousHand = sample.hand;
      const event: HandGesture | null =
        direct && ready
          ? {
              kind: 'side',
              hand: sample.hand as 1 | -1,
              facing: sample.facing,
              sequence: debug.activations + 1,
            }
          : directional;
      if (event?.kind === 'behind')
        event.double =
          Number.isFinite(time) && time >= lastBehindAt && time - lastBehindAt <= doubleFlickWindow;
      const isRearUpgrade = (command: HandGesture | null | undefined) =>
        command?.kind === 'behind' && command.double === true && sample.crossingKind === 'behind';
      if (!sample.eligible || sample.crossing) {
        if (!sample.eligible || !isRearUpgrade(pending[0])) {
          if (pending.length && sample.crossing) debug.rejected++;
          pending.length = 0;
          debug.pending = 0;
        }
      }
      if (!sample.eligible) {
        lastBehindAt = -Infinity;
        debug.accepted = null;
      }
      if (!event) return;
      debug.accepted = null;
      debug.activations++;
      debug.last = { ...event, sequence: debug.activations };
      if (sample.crossing && !isRearUpgrade(event)) {
        debug.rejected++;
        return;
      }
      if (sample.eligible) {
        lastBehindAt = event.kind === 'behind' && !event.double ? time : -Infinity;
        // An active rear crossover accepts only the second quick rear flick.
        pending.length = 0;
        pending.push(debug.last);
        debug.accepted = debug.last;
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
