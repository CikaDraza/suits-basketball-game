import { Bone, Matrix3, Object3D, Quaternion, Vector3 } from 'three';
import { forEachFootVertex } from './footGrounding';
import { createLimbIK } from './limbIK';

/**
 * Leg chains measured once from the clone's rest (bind) pose:
 * - bone lengths (IK preserves them), the full leg length (for stride calibration),
 * - each foot's rest position/orientation in model space (neutral stance, flat foot),
 * - ankle height = foot joint above the lowest authored sole vertex, so an ankle target at
 *   floor + ankleHeight with the rest foot orientation puts the shoe sole on the court.
 */
export interface LegChain {
  side: 'Left' | 'Right';
  thigh: Bone;
  shin: Bone;
  foot: Bone;
  solve: ReturnType<typeof createLimbIK>;
  length: number;
  restFoot: Vector3;
  restFootQuat: Quaternion;
  ankleHeight: number;
}

export function createLegRig(model: Object3D, bones: Record<string, Bone | undefined>) {
  model.updateMatrixWorld(true);
  const minSole = { left: Infinity, right: Infinity };
  const point = new Vector3();
  forEachFootVertex(model, (mesh, vertex, side) => {
    mesh.getVertexPosition(vertex, point).applyMatrix4(mesh.matrixWorld);
    minSole[side] = Math.min(minSole[side], point.y);
  });
  const hips = bones.Hips;
  if (!hips) return null;
  const legs: LegChain[] = [];
  for (const side of ['Left', 'Right'] as const) {
    const thigh = bones[`${side}UpLeg`],
      shin = bones[`${side}Leg`],
      foot = bones[`${side}Foot`];
    const sole = minSole[side === 'Left' ? 'left' : 'right'];
    if (!thigh || !shin || !foot || !Number.isFinite(sole)) return null;
    const a = thigh.getWorldPosition(new Vector3()),
      b = shin.getWorldPosition(new Vector3()),
      f = foot.getWorldPosition(new Vector3());
    legs.push({
      side,
      thigh,
      shin,
      foot,
      solve: createLimbIK(thigh, shin, foot),
      length: a.distanceTo(b) + b.distanceTo(f),
      restFoot: f.clone(),
      restFootQuat: foot.getWorldQuaternion(new Quaternion()),
      ankleHeight: f.y - sole,
    });
  }
  const parentInverse = new Matrix3(),
    world = new Vector3();
  return {
    hips,
    legs,
    /** mean full leg length (m) for stride calibration */
    legLength: (legs[0].length + legs[1].length) / 2,
    /** rest hip-joint (thigh) height above the floor */
    thighHeight:
      (legs[0].thigh.getWorldPosition(new Vector3()).y +
        legs[1].thigh.getWorldPosition(new Vector3()).y) /
      2,
    /** move the pelvis by a world-space offset (works under rotated/scaled parents) */
    shiftPelvis(dx: number, dy: number, dz: number) {
      parentInverse.setFromMatrix4(hips.parent!.matrixWorld).invert();
      hips.position.add(world.set(dx, dy, dz).applyMatrix3(parentInverse));
      hips.updateWorldMatrix(false, true);
    },
  };
}
export type LegRig = NonNullable<ReturnType<typeof createLegRig>>;
