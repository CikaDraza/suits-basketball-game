import type { Legend } from '../data/gameConfig';
import type { ControlContext, PadBinding } from './controlBindings';
import type { HandGesture, SkillVector, DribbleSkillKind } from './skillGesture';

/** Transient diagnostics only; never an input/animation/physics authority. */
export interface RightStickSnapshot {
  slot: number;
  legend: Legend;
  context: ControlContext;
  time: number;
  device: string | null;
  enabled: boolean;
  eligible: boolean;
  rawAxes: { axis2: number; axis3: number };
  bindings: Record<'left' | 'right' | 'up' | 'down', PadBinding | null>;
  calibrated: SkillVector;
  processed: SkillVector;
  normalized: SkillVector;
  screenForward: SkillVector;
  bodyRelative: { left: number; forward: number };
  resolved: DribbleSkillKind | null;
  anatomicalHand: 1 | -1 | null;
  selected: string;
  executing: string;
  phase: 'neutral-required' | 'armed' | 'held';
  accepted: HandGesture | null;
  lockedFacing: number | null;
  bodyFacing: number;
  cameraYaw: number;
  cameraPitch: number;
  cameraPitchScale: number;
  movementYaw: number;
}

export const rightStickDebug: (RightStickSnapshot | null)[] = [null, null];
