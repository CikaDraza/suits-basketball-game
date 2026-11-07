import { Vector3 } from 'three';
import { clamp } from '../utils/math';
import { COURT } from './constants';

// Spring-back joint model shared by the hoop. Angles are offsets from the rest pose (rad).
export interface Spring {
  angle: number;
  vel: number;
  min: number;
  max: number;
  stiffness: number;
  damping: number;
  /** external torque applied this step (e.g. a player hanging on the rim) */
  ext: number;
}

export interface HoopRig {
  hinge1: Spring; // lower breakaway arm — 15° downward flex
  hinge2: Spring; // upper extension arm — 45° downward flex
  rimX: Spring; // roll  (left/right tilt)
  rimY: Spring; // yaw   (left/right deflection)
  rimZ: Spring; // pitch (downward breakaway, front dunks)
}

const DEG = Math.PI / 180;
const spring = (stiffness: number, damping: number, min: number, max: number): Spring => ({
  angle: 0,
  vel: 0,
  min,
  max,
  stiffness,
  damping,
  ext: 0,
});

export const createHoopRig = (): HoopRig => ({
  hinge1: spring(260, 24, -15 * DEG, 0),
  hinge2: spring(90, 11, -45 * DEG, 0),
  rimX: spring(150, 10, -0.22, 0.22),
  rimY: spring(150, 10, -0.22, 0.22),
  rimZ: spring(170, 11, -0.55, 0.03),
});

/** Effective rim inertia and how much rim torque bleeds into the arm hinges. */
export const RIG_COUPLING = { rimInertia: 1.6, toHinge2: 0.12, toHinge1: 0.03 };
/** Share of the sustained rim pitch torque that reaches the arm hinges while a player hangs. */
export const HANG_COUPLING = { hinge2: 22 / 70, hinge1: 9 / 70 };

/** Semi-implicit damped spring with hard limits (velocity is killed into a limit). */
export function stepSpring(s: Spring, dt: number) {
  s.vel += (-s.stiffness * s.angle - s.damping * s.vel + s.ext) * dt;
  s.angle += s.vel * dt;
  if (s.angle < s.min) {
    s.angle = s.min;
    s.vel = Math.max(0, s.vel);
  }
  if (s.angle > s.max) {
    s.angle = s.max;
    s.vel = Math.min(0, s.vel);
  }
}

/** Feed an angular impulse (board-local frame) into the rim + cascade to arms. */
export function applyRimAngularImpulse(rig: HoopRig, tx: number, ty: number, tz: number) {
  const I = RIG_COUPLING.rimInertia;
  rig.rimX.vel += tx / I;
  rig.rimY.vel += ty / I;
  rig.rimZ.vel += tz / I;
  rig.hinge2.vel += tz * RIG_COUPLING.toHinge2;
  rig.hinge1.vel += tz * RIG_COUPLING.toHinge1;
}

export type Vec3 = [number, number, number];

const REST_RIM = new Vector3(COURT.BASKET_X, COURT.RIM_Y, 0);
const REST_GRIP_LOCAL = new Vector3(0.2, 0, 0);

/**
 * Transient hoop state shared between the simulation (Duel.ts), the hoop renderer
 * and the characters. Mutated every frame — never put this in React state.
 */
export const hoop = {
  rig: createHoopRig(),
  /** world-space point + impulse ON the rim, consumed by <BasketballHoop/> */
  impulses: [] as { point: Vec3; impulse: Vec3 }[],
  /**
   * A player hanging on the rim. `local` is the hands' grip point in RimCenter space
   * (x → toward the court, z → across), `force` the downward pull in newtons-ish units.
   */
  hang: { remaining: 0, force: 0, slam: 0, local: REST_GRIP_LOCAL.clone() },
  /** live world position of the grip point (follows the bending rim) */
  gripWorld: REST_RIM.clone().add(REST_GRIP_LOCAL),
  /** live world position of the rim centre */
  rimWorld: REST_RIM.clone(),
};

export function hoopImpulse(point: Vec3, impulse: Vec3) {
  hoop.impulses.push({ point, impulse });
}

/**
 * Player hangs on the rim: the pull bends the rim down, rolls it toward the grip side
 * and flexes both arm hinges. `lateral` is the grip offset across the rim (-1 … 1).
 */
export function hangOnRim(seconds: number, force: number, lateral: number, slam = 0) {
  hoop.hang.remaining = seconds;
  hoop.hang.force = force;
  hoop.hang.slam = slam; // one-off downward impulse at the grip (the slam itself)
  hoop.hang.local.set(0.2, 0, clamp(lateral, -1, 1) * 0.17);
}

export function resetHoop() {
  const fresh = createHoopRig();
  Object.assign(hoop.rig, fresh);
  hoop.impulses.length = 0;
  hoop.hang.remaining = 0;
  hoop.hang.force = 0;
  hoop.hang.slam = 0;
  hoop.hang.local.copy(REST_GRIP_LOCAL);
  hoop.rimWorld.copy(REST_RIM);
  hoop.gripWorld.copy(REST_RIM).add(REST_GRIP_LOCAL);
}
