import type { Locomotion } from './gait';
import type { Posture, UpperBody } from './posture';

type Point = { x: number; y: number; z: number };

/** Per-slot animation diagnostics written by Character each frame (tests + debug view). */
export interface LocomotionSnapshot {
  locomotion: Locomotion;
  posture: Posture;
  upper: UpperBody;
  moving: boolean;
  speed: number;
  forwardSpeed: number;
  sideSpeed: number;
  phase: number;
  steps: number;
  /** times the feet were re-planted under the body (teleport, reset, long frame hitch) */
  resets: number;
  brace: number;
  pelvisDrop: number;
  /** how far the pelvis had to drop below its posture height so the feet reach (m) */
  reachDrop: number;
  stride: number;
  grounded: boolean;
  feet: { planted: boolean; target: Point; neutral: Point; lift: number; yaw: number }[];
}

export const locomotionDebug: (LocomotionSnapshot | null)[] = [null, null];
