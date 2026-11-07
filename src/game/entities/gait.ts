import { Vector3 } from 'three';

/*
 * World-anchored foot planting, driven by the body's measured travel.
 *
 * - Locomotion (idle / forward / backward / strafe) comes from the horizontal rigid-body
 *   velocity expressed in the character's facing frame, with speed and angle hysteresis.
 * - Each foot is either PLANTED at a fixed world point (stance) or SWINGING from its
 *   lift-off point to a landing point ahead of its neutral spot along the travel direction.
 * - While travelling, the step clock advances with distance (phase += travel / 2·stride),
 *   so cadence follows measured speed and the stance foot stays fixed on the court.
 * - At rest the clock stops; a foot that ended far from its neutral spot (stop, turn in
 *   place, posture change) takes one short time-based settle step, one foot at a time.
 */

export type Locomotion = 'idle' | 'forward' | 'backward' | 'strafe';

export interface GaitTuning {
  /** hysteresis: start stepping above, stop below (m/s) */
  startSpeed: number;
  stopSpeed: number;
  /** half-width (rad) of the forward / backward sectors; the rest is strafe */
  sector: number;
  /** extra angle a classification must be exceeded by before it changes (rad) */
  sectorMargin: number;
  /** horizontal distance from the neutral spot that triggers a settle step (m) */
  settleDistance: number;
  /** foot yaw error that triggers a settle step (rad) */
  settleYaw: number;
  settleDuration: number;
  settleLift: number;
  /** a planted foot further than this from its neutral spot is replanted while moving (m) */
  maxStanceOffset: number;
  /** minimum side-to-side spacing between the feet, in the facing frame (m) */
  minFootGap: number;
  /**
   * distance the body must leave its rest spot before stepping starts (m): shoves and
   * contact jitter around a planted stance do not start a walk
   */
  startDistance: number;
}

export interface GaitStep {
  /** body-relative stride (m): body travel per single step */
  stride: number;
  lift: number;
}

export interface FootState {
  planted: Vector3;
  plantedYaw: number;
  swinging: boolean;
  /** swing progress 0..1 */
  swing: number;
  /** settle swings are time based; travel swings follow the distance clock */
  timed: boolean;
  /** leg phase at which a distance-driven swing began (continuous progress if it began late) */
  swingStart: number;
  /** step-clock cycle in which this foot last stepped: one travel step per cycle */
  cycle: number;
  /** duration of a timed (settle / forced) swing */
  duration: number;
  from: Vector3;
  fromYaw: number;
  /** output: ankle target (world) and yaw for this frame */
  target: Vector3;
  yaw: number;
  lift: number;
}

export interface GaitState {
  ready: boolean;
  moving: boolean;
  locomotion: Locomotion;
  phase: number;
  speed: number;
  forwardSpeed: number;
  sideSpeed: number;
  dirX: number;
  dirZ: number;
  feet: [FootState, FootState];
  steps: number;
  /** body position where stepping last stopped (start hysteresis by distance) */
  anchorX: number;
  anchorZ: number;
}

const foot = (): FootState => ({
  planted: new Vector3(),
  plantedYaw: 0,
  swinging: false,
  swing: 0,
  timed: false,
  swingStart: 0.5,
  cycle: -1,
  duration: 0.2,
  from: new Vector3(),
  fromYaw: 0,
  target: new Vector3(),
  yaw: 0,
  lift: 0,
});

export function createGaitState(): GaitState {
  return {
    ready: false,
    moving: false,
    locomotion: 'idle',
    phase: 0,
    speed: 0,
    forwardSpeed: 0,
    sideSpeed: 0,
    dirX: 0,
    dirZ: 1,
    feet: [foot(), foot()],
    steps: 0,
    anchorX: 0,
    anchorZ: 0,
  };
}

const wrapAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const ease = (t: number) => t * t * (3 - 2 * t);

/** Classify velocity in the facing frame with sector hysteresis. */
export function classifyLocomotion(
  forward: number,
  side: number,
  previous: Locomotion,
  tuning: Pick<GaitTuning, 'sector' | 'sectorMargin'>,
): Exclude<Locomotion, 'idle'> {
  const off = Math.abs(Math.atan2(side, forward)); // 0 = straight ahead, π = straight back
  const { sector, sectorMargin: m } = tuning;
  if (previous === 'forward' && off < sector + m) return 'forward';
  if (previous === 'backward' && off > Math.PI - sector - m) return 'backward';
  if (previous === 'strafe' && off > sector - m && off < Math.PI - sector + m) return 'strafe';
  return off <= sector ? 'forward' : off >= Math.PI - sector ? 'backward' : 'strafe';
}

export interface GaitInput {
  dt: number;
  /** rendered body displacement since the previous frame (world, horizontal) */
  travelX: number;
  travelZ: number;
  /** measured horizontal velocity of the body (world) — direction and pace */
  velocityX: number;
  velocityZ: number;
  /**
   * net speed over a short window (defaults to |velocity|): drives the start/stop
   * hysteresis so contact jitter (shoved back and forth while blocked) is not a walk
   */
  netSpeed?: number;
  /** facing angle: forward = (sin, cos) */
  angle: number;
  /** neutral ankle positions under the body for the current posture (world, y = ankle height) */
  neutral: readonly [Vector3, Vector3];
  /** gait parameters blended for the current posture/direction */
  step: GaitStep;
  /** reset feet to neutral (teleport, landing from the air, revision change) */
  reset: boolean;
  /** body position (world, horizontal) */
  bodyX: number;
  bodyZ: number;
}

const _landing = new Vector3(),
  _local = new Vector3();

/** Advance the gait one rendered frame. Writes `feet[i].target/yaw/lift`. */
export function stepGait(state: GaitState, input: GaitInput, tuning: GaitTuning): GaitState {
  const { dt, angle, neutral, step } = input;
  const fx = Math.sin(angle),
    fz = Math.cos(angle);
  const lx = fz,
    lz = -fx; // character's left (+X in model space)

  if (!state.ready || input.reset) {
    state.feet.forEach((f, i) => {
      f.planted.copy(neutral[i]);
      f.plantedYaw = angle;
      f.swinging = false;
      f.target.copy(neutral[i]);
      f.yaw = angle;
      f.lift = 0;
    });
    state.ready = true;
    state.moving = false;
    state.anchorX = input.bodyX;
    state.anchorZ = input.bodyZ;
    state.locomotion = 'idle';
    state.phase = 0;
    return state;
  }

  // ---- measured motion in the facing frame
  const speed = Math.hypot(input.velocityX, input.velocityZ);
  state.speed = speed;
  state.forwardSpeed = input.velocityX * fx + input.velocityZ * fz;
  state.sideSpeed = input.velocityX * lx + input.velocityZ * lz;
  const wasMoving = state.moving;
  // start only once the body has really left its rest spot (contact jitter and shoves do
  // not start a walk); stop as soon as the measured speed drops (no lingering steps)
  const net = input.netSpeed ?? speed;
  const away = Math.hypot(input.bodyX - state.anchorX, input.bodyZ - state.anchorZ);
  state.moving = state.moving
    ? speed > tuning.stopSpeed
    : speed > tuning.startSpeed && net > tuning.startSpeed && away > tuning.startDistance;
  if (!state.moving) {
    if (wasMoving || away > tuning.startDistance * 3) {
      // re-anchor where the body came to rest (or drifted to, without ever walking)
      state.anchorX = input.bodyX;
      state.anchorZ = input.bodyZ;
    }
  }
  if (state.moving && !wasMoving) {
    // starting from a square stance: one leg at mid-stance, the other at mid-swing,
    // both of which put the foot under the body — the first step is a half step
    state.phase = Math.floor(state.phase) + 0.25;
    state.feet.forEach((f) => (f.cycle = -1));
  }
  state.locomotion = state.moving
    ? classifyLocomotion(state.forwardSpeed, state.sideSpeed, state.locomotion, tuning)
    : 'idle';
  const travel = Math.hypot(input.travelX, input.travelZ);
  if (travel > 1e-6) {
    state.dirX = input.travelX / travel;
    state.dirZ = input.travelZ / travel;
  } else if (speed > 1e-6) {
    state.dirX = input.velocityX / speed;
    state.dirZ = input.velocityZ / speed;
  }

  // ---- distance-driven step clock (frozen at rest)
  if (state.moving) state.phase += travel / (2 * Math.max(0.05, step.stride));

  const landing = (i: number, out: Vector3) => {
    out.copy(neutral[i]);
    if (state.moving) {
      out.x += state.dirX * step.stride * 0.5;
      out.z += state.dirZ * step.stride * 0.5;
    }
    // never cross the other foot: keep the spacing in the facing frame
    const other = state.feet[1 - i];
    const otherPoint = other.swinging ? neutral[1 - i] : other.planted;
    const side = i === 0 ? 1 : -1;
    _local.copy(out).sub(otherPoint);
    const across = _local.x * lx + _local.z * lz;
    const deficit = tuning.minFootGap - side * across;
    if (deficit > 0) {
      out.x += lx * side * deficit;
      out.z += lz * side * deficit;
    }
    return out;
  };

  const legClock = (i: number) => state.phase + i * 0.5;
  const legPhase = (i: number) => legClock(i) - Math.floor(legClock(i));
  const cycleOf = (i: number) => Math.floor(legClock(i));

  // pass 1: advance and land swings already in the air, so a foot that lands this frame
  // frees the other one to lift in the same frame (no skipped steps at low frame rates)
  for (let i = 0; i < 2; i++) {
    const f = state.feet[i];
    if (!f.swinging) continue;
    if (f.timed || !state.moving) {
      f.timed = true;
      f.swing = Math.min(1, f.swing + dt / f.duration);
    } else {
      // continuous even if the swing began late in its half-cycle; wrap = landing
      const lp = legPhase(i);
      f.swing =
        f.cycle === cycleOf(i) && lp >= f.swingStart
          ? Math.min(1, (lp - f.swingStart) / Math.max(1e-3, 1 - f.swingStart))
          : 1;
    }
    placeSwing(i);
  }

  // pass 2: lift at most one foot — on the step clock, before a planted foot would leave
  // its reach, or to settle under the body at rest. The offset is predicted where the body
  // will be next frame (a foot ahead of the body gets closer, a trailing one further), and
  // the furthest foot goes first so neither leg can starve the other.
  let pick = -1,
    pickScore = -1;
  for (let i = 0; i < 2; i++) {
    const f = state.feet[i];
    if (f.swinging) continue;
    const lp = legPhase(i);
    const wantsSwing = state.moving && lp >= 0.5 && f.cycle !== cycleOf(i);
    const ahead = Math.hypot(
      f.planted.x - neutral[i].x - input.travelX,
      f.planted.z - neutral[i].z - input.travelZ,
    );
    const off = Math.hypot(f.planted.x - neutral[i].x, f.planted.z - neutral[i].z);
    const yawError = Math.abs(wrapAngle(f.plantedYaw - angle));
    const overreach = state.moving && ahead > tuning.maxStanceOffset;
    const unsettled = !state.moving && (off > tuning.settleDistance || yawError > tuning.settleYaw);
    // only an overreaching foot may cut the other foot's swing short (see below)
    if (state.feet[1 - i].swinging && !overreach) continue;
    if (!(wantsSwing || overreach || unsettled)) continue;
    const score = (overreach ? 10 : 0) + (wantsSwing ? 5 : 0) + ahead + yawError * 0.3;
    if (score > pickScore) {
      pick = i;
      pickScore = score;
    }
  }
  if (pick >= 0) {
    const i = pick,
      f = state.feet[i];
    const lp = legPhase(i),
      cycle = cycleOf(i);
    const wantsSwing = state.moving && lp >= 0.5 && f.cycle !== cycle;
    const other = state.feet[1 - i];
    if (other.swinging) {
      // at low frame rates the body can outrun a step: land the other foot now so one foot
      // is always on the court and the trailing foot never stays planted out of reach
      other.swing = 1;
      placeSwing(1 - i);
    }
    f.swinging = true;
    f.swing = 0;
    f.timed = !wantsSwing;
    f.swingStart = wantsSwing ? lp : 0.5;
    // a forced replant while travelling must land before the body outruns it
    f.duration = state.moving
      ? Math.min(tuning.settleDuration, Math.max(0.1, (0.5 * step.stride) / Math.max(speed, 0.1)))
      : tuning.settleDuration;
    // a forced replant counts as this cycle's step so the clock does not double-step
    if (state.moving) f.cycle = cycle;
    f.from.copy(f.planted);
    f.fromYaw = f.plantedYaw;
    state.steps++;
    placeSwing(i);
  }

  // pass 3: planted feet hold their world point
  for (const f of state.feet) {
    if (f.swinging) continue;
    f.target.copy(f.planted);
    f.yaw = f.plantedYaw;
    f.lift = 0;
  }

  function placeSwing(i: number) {
    const f = state.feet[i];
    landing(i, _landing);
    const e = ease(f.swing);
    f.target.lerpVectors(f.from, _landing, e);
    const lift = f.timed ? tuning.settleLift : step.lift;
    f.lift = Math.sin(Math.PI * f.swing) * lift;
    f.target.y = neutral[i].y + f.lift;
    f.yaw = f.fromYaw + wrapAngle(angle - f.fromYaw) * e;
    if (f.swing >= 1) {
      if (f.timed && state.moving) {
        // a forced/settle step landed at the start of stance: put the clock back in step
        // with this leg so the regular rhythm resumes instead of chaining forced steps
        const clock = Math.round(state.phase + i * 0.5);
        state.phase = clock - i * 0.5;
        f.cycle = clock - 1;
        state.feet[1 - i].cycle = Math.floor(state.phase + (1 - i) * 0.5) - 1;
      }
      f.swinging = false;
      f.planted.copy(_landing);
      f.planted.y = neutral[i].y;
      f.plantedYaw = angle;
      f.target.copy(f.planted);
      f.yaw = angle;
      f.lift = 0;
    }
  }
  return state;
}
