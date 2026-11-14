export const MOTION_THRESHOLDS = {
  settleWeight: 0.9,
  elbowMinDegrees: 0,
  elbowMaxDegrees: 150,
  wristMaxDegrees: 65,
  palmTargetErrorMeters: 0.04,
  elbowPlaneErrorDegrees: 8,
  reachRatioMin: 0.55,
  palmForwardDotMin: 0.7,
  oppositeGuardElbowMinDegrees: 50,
} as const;
export interface ArmMeasurement {
  weight: number;
  elbowFlex: number;
  wristBend: number;
  elbowPlaneError: number;
  contactError: number;
}
export interface MotionWarning {
  comparison?: '>' | '<';
  rule: string;
  part: string;
  measured: number;
  threshold: number;
  unit: string;
}
/** Measured threshold checks, not a claim of anatomical correctness or an AI diagnosis. */
export function evaluateArmRules(arms: readonly ArmMeasurement[]): MotionWarning[] {
  const warnings: MotionWarning[] = [];
  arms.forEach((arm, i) => {
    const part = i === 0 ? 'left' : 'right';
    if (
      [arm.weight, arm.elbowFlex, arm.wristBend, arm.elbowPlaneError, arm.contactError].some(
        (v) => !Number.isFinite(v),
      )
    ) {
      warnings.push({ rule: 'POSE-NONFINITE', part, measured: NaN, threshold: 0, unit: 'finite' });
      return;
    }
    if (arm.weight < MOTION_THRESHOLDS.settleWeight) return;
    const check = (rule: string, measured: number, threshold: number, unit = 'degrees') => {
      if (measured > threshold) warnings.push({ rule, part, measured, threshold, unit });
    };
    check('DEF-ELBOW-RANGE', arm.elbowFlex, MOTION_THRESHOLDS.elbowMaxDegrees);
    check('DEF-ELBOW-MIN', -arm.elbowFlex, -MOTION_THRESHOLDS.elbowMinDegrees);
    check('DEF-WRIST-RANGE', arm.wristBend, MOTION_THRESHOLDS.wristMaxDegrees);
    check('DEF-ELBOW-PLANE', arm.elbowPlaneError, MOTION_THRESHOLDS.elbowPlaneErrorDegrees);
    check('DEF-PALM-TARGET', arm.contactError, MOTION_THRESHOLDS.palmTargetErrorMeters, 'meters');
  });
  return warnings;
}

export interface ReachMeasurement extends ArmMeasurement {
  shoulder: { x: number; z: number };
  wrist: { x: number; z: number };
  upperLength: number;
  foreLength: number;
}
/** Structural DEF-ARM-001 checks against final measured arms, not the pose label. */
export function evaluateReachRules(
  mode: string,
  facing: number,
  arms: readonly ReachMeasurement[],
  normals: readonly { x: number; z: number }[],
): MotionWarning[] {
  if (
    (mode !== 'left' && mode !== 'right') ||
    arms.length < 2 ||
    normals.length < 2 ||
    arms.some((a) => a.weight < MOTION_THRESHOLDS.settleWeight)
  )
    return [];
  const index = mode === 'left' ? 0 : 1,
    sign = index === 0 ? 1 : -1;
  const arm = arms[index],
    guard = arms[1 - index];
  const lateral =
    (sign *
      ((arm.wrist.x - arm.shoulder.x) * Math.cos(facing) -
        (arm.wrist.z - arm.shoulder.z) * Math.sin(facing))) /
    (arm.upperLength + arm.foreLength);
  const palm = normals[index].x * Math.sin(facing) + normals[index].z * Math.cos(facing);
  const result: MotionWarning[] = [];
  if (lateral < MOTION_THRESHOLDS.reachRatioMin)
    result.push({
      rule: 'DEF-ARM-001-SIDE',
      part: mode,
      measured: lateral,
      threshold: MOTION_THRESHOLDS.reachRatioMin,
      unit: 'reach-ratio',
      comparison: '<',
    });
  if (palm < MOTION_THRESHOLDS.palmForwardDotMin)
    result.push({
      rule: 'DEF-ARM-001-PALM',
      part: mode,
      measured: palm,
      threshold: MOTION_THRESHOLDS.palmForwardDotMin,
      unit: 'forward-dot',
      comparison: '<',
    });
  if (guard.elbowFlex < MOTION_THRESHOLDS.oppositeGuardElbowMinDegrees)
    result.push({
      rule: 'DEF-ARM-001-GUARD',
      part: index === 0 ? 'right' : 'left',
      measured: guard.elbowFlex,
      threshold: MOTION_THRESHOLDS.oppositeGuardElbowMinDegrees,
      unit: 'degrees',
      comparison: '<',
    });
  return result;
}
