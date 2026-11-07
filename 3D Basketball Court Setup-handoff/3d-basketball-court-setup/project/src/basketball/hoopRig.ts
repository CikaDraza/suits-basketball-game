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
  rimX: Spring;   // roll  (left/right twist)
  rimY: Spring;   // yaw   (left/right deflection)
  rimZ: Spring;   // pitch (downward breakaway, front dunks)
}

const DEG = Math.PI / 180;
const spring = (stiffness: number, damping: number, min: number, max: number): Spring =>
  ({ angle: 0, vel: 0, min, max, stiffness, damping, ext: 0 });

export const createHoopRig = (): HoopRig => ({
  hinge1: spring(260, 24, -15 * DEG, 0),
  hinge2: spring(90, 11, -45 * DEG, 0),
  rimX: spring(150, 10, -0.22, 0.22),
  rimY: spring(150, 10, -0.22, 0.22),
  rimZ: spring(170, 11, -0.55, 0.03),
});

/** Effective rim inertia and how much rim torque bleeds into the arm hinges. */
export const RIG_COUPLING = { rimInertia: 1.6, toHinge2: 0.12, toHinge1: 0.03 };
/** Sustained torques while a player hangs on the rim. */
export const HANG_TORQUE = { rimZ: -70, hinge2: -22, hinge1: -9 };

/** Semi-implicit damped spring with hard limits (velocity is killed into a limit). */
export function stepSpring(s: Spring, dt: number) {
  s.vel += (-s.stiffness * s.angle - s.damping * s.vel + s.ext) * dt;
  s.angle += s.vel * dt;
  if (s.angle < s.min) { s.angle = s.min; s.vel = Math.max(0, s.vel); }
  if (s.angle > s.max) { s.angle = s.max; s.vel = Math.min(0, s.vel); }
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
