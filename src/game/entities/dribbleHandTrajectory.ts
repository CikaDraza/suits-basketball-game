import { config, type Legend } from '../data/gameConfig';
import { dribbleHeight, smoothUnit } from '../simulation/ballHandling';
import type { DribbleShape } from '../simulation/dribbleProfile';

/** Presentation only: sampled from the authoritative ball phase, never a second clock. */
export interface DribbleHandSample {
  height: number;
  retraction: number;
  pitch: number;
}

// Hermite tangents are scaled by phase-interval length, never render delta.
// Matching the bounce derivative avoids a speed discontinuity at both contacts.
function segment(t: number, start: number, end: number, v0: number, v1: number) {
  const t2 = t * t,
    t3 = t2 * t;
  return (
    (2 * t3 - 3 * t2 + 1) * start +
    (t3 - 2 * t2 + t) * v0 +
    (-2 * t3 + 3 * t2) * end +
    (t3 - t2) * v1
  );
}

export function sampleDribbleHandMotion(
  legend: Legend,
  phase: number,
  out: DribbleHandSample,
  activeShape?: DribbleShape | null,
) {
  const timing = config.animation.dribbleHand;
  const shape = activeShape ?? config.ballControl[legend];
  const profile = activeShape ?? timing[legend];
  const p = ((phase % 1) + 1) % 1;
  const {
    releasePhase: release,
    followThroughPhase: low,
    recoveryPhase: recovery,
    catchPhase: contact,
  } = timing;
  const top = shape.dribbleTop + config.ball.radius;
  const span = shape.dribbleTop - config.ball.radius;
  if (p <= release || p >= contact) {
    out.height = dribbleHeight(p, shape.dribbleTop, config.ball.radius) + config.ball.radius;
    out.retraction = 0;
  } else if (p < low) {
    const t = (p - release) / (low - release);
    out.height = segment(
      t,
      top - 4 * span * release * release,
      top - profile.drop,
      -8 * span * release * (low - release),
      0,
    );
    out.retraction = smoothUnit(t);
  } else if (p < recovery) {
    out.height = top - profile.drop;
    out.retraction = 1;
  } else {
    const t = (p - recovery) / (contact - recovery);
    out.height = segment(
      t,
      top - profile.drop,
      top - 4 * span * (1 - contact) ** 2,
      0,
      8 * span * (1 - contact) * (contact - recovery),
    );
    out.retraction = 1 - smoothUnit(t);
  }
  out.pitch = timing.wristPitch * out.retraction;
  return out;
}
