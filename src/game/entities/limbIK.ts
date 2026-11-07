import { Bone, Quaternion, Vector3 } from 'three';
import { clamp } from '../utils/math';

/** Two-bone IK with an explicit bend pole, independent of the rig's rest frame. */
export function createLimbIK(thigh: Bone, shin: Bone, foot: Bone) {
  const hip = new Vector3(),
    knee = new Vector3(),
    ankle = new Vector3();
  const direction = new Vector3(),
    bend = new Vector3(),
    desiredKnee = new Vector3();
  const from = new Vector3(),
    to = new Vector3();
  const rotation = new Quaternion(),
    world = new Quaternion(),
    parent = new Quaternion();
  const footRotation = new Quaternion();

  function pointBone(bone: Bone, current: Vector3, desired: Vector3) {
    if (current.lengthSq() < 1e-10 || desired.lengthSq() < 1e-10) return;
    rotation.setFromUnitVectors(current.normalize(), desired.normalize());
    bone.getWorldQuaternion(world).premultiply(rotation);
    bone.parent!.getWorldQuaternion(parent).invert();
    bone.quaternion.copy(parent).multiply(world);
    bone.updateWorldMatrix(false, true);
  }

  return (target: Vector3, forward: Vector3) => {
    thigh.updateWorldMatrix(true, true);
    thigh.getWorldPosition(hip);
    shin.getWorldPosition(knee);
    foot.getWorldPosition(ankle);
    foot.getWorldQuaternion(footRotation);
    const upper = hip.distanceTo(knee),
      lower = knee.distanceTo(ankle);
    direction.copy(target).sub(hip);
    const distance = clamp(
      direction.length(),
      Math.abs(upper - lower) + 1e-5,
      upper + lower - 1e-5,
    );
    direction.normalize();
    // The pole selects the anatomical knee bend or the outward elbow bend.
    bend.copy(forward).addScaledVector(direction, -forward.dot(direction)).normalize();
    const along = (upper * upper - lower * lower + distance * distance) / (2 * distance);
    const height = Math.sqrt(Math.max(0, upper * upper - along * along));
    desiredKnee.copy(hip).addScaledVector(direction, along).addScaledVector(bend, height);
    pointBone(thigh, from.copy(knee).sub(hip), to.copy(desiredKnee).sub(hip));
    shin.getWorldPosition(knee);
    foot.getWorldPosition(ankle);
    pointBone(
      shin,
      from.copy(ankle).sub(knee),
      to.copy(hip).addScaledVector(direction, distance).sub(knee),
    );
    foot.parent!.getWorldQuaternion(parent).invert();
    foot.quaternion.copy(parent).multiply(footRotation);
    foot.updateWorldMatrix(false, true);
  };
}
