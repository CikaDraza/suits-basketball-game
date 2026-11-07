import { Bone, Object3D, Vector3 } from 'three';
import type { RapierRigidBody } from '@react-three/rapier';
import type { PlayerSlot } from '../simulation/types';
import { forEachFootVertex } from '../entities/footGrounding';
import type { createArmContact } from '../entities/armContact';

export interface CharacterPoseSnapshot {
  bodyY: number;
  capsuleBottomY: number;
  capsuleHalfHeight: number;
  capsuleRadius: number;
  hipsLocalY: number;
  hipsWorldY: number;
  leftSoleY: number;
  rightSoleY: number;
  joints: Record<string, { x: number; y: number; z: number }>;
  hands: {
    palm: { x: number; y: number; z: number };
    target: { x: number; y: number; z: number };
    normal: { x: number; y: number; z: number };
    wristBend: number;
    elbowBend: number;
    forearmTwist: number;
    error: number;
    weight: number;
    socketPosition: number[];
    socketQuaternion: number[];
  }[];
}
export function readHandContacts(root: Object3D): CharacterPoseSnapshot['hands'] {
  let arms: ReturnType<typeof createArmContact>[] = [];
  root.traverse((object) => {
    if (object.userData.handContacts) arms = object.userData.handContacts as typeof arms;
  });
  return arms.map((arm) => ({
    ...arm.debug,
    palm: { ...arm.debug.palm },
    target: { ...arm.debug.target },
    normal: { ...arm.debug.normal },
    socketPosition: arm.socket.position.toArray(),
    socketQuaternion: arm.socket.quaternion.toArray(),
  }));
}

/** On-demand CPU skinning for regression checks; never scans vertices in the frame loop. */
export function readCharacterPose(
  scene: Object3D,
  slot: PlayerSlot,
  body: RapierRigidBody | null,
): CharacterPoseSnapshot | null {
  const root = scene.getObjectByName(`character-${slot}`);
  if (!root || !body) return null;

  scene.updateMatrixWorld(true);
  const point = new Vector3();
  let hips: Bone | undefined;
  let leftSoleY = Infinity;
  let rightSoleY = Infinity;
  const joints: CharacterPoseSnapshot['joints'] = {};

  root.traverse((object) => {
    if (!(object instanceof Bone)) return;
    if (/Hips$/.test(object.name)) hips = object;
    const name = object.name.replace(/^mixamorig:?/, '');
    if (/^(Left|Right)(Hand|ForeArm|Arm|Leg|Foot)$/.test(name)) {
      object.getWorldPosition(point);
      joints[name] = { x: point.x, y: point.y, z: point.z };
    }
  });
  forEachFootVertex(root, (mesh, vertex, side) => {
    mesh.getVertexPosition(vertex, point).applyMatrix4(mesh.matrixWorld);
    if (side === 'left') leftSoleY = Math.min(leftSoleY, point.y);
    else rightSoleY = Math.min(rightSoleY, point.y);
  });

  if (!hips || !Number.isFinite(leftSoleY) || !Number.isFinite(rightSoleY)) return null;
  const collider = body.collider(0);
  const bodyY = body.translation().y;
  const capsuleHalfHeight = collider.halfHeight();
  const capsuleRadius = collider.radius();
  return {
    bodyY,
    capsuleBottomY: bodyY - capsuleHalfHeight - capsuleRadius,
    capsuleHalfHeight,
    capsuleRadius,
    hipsLocalY: hips.position.y,
    hipsWorldY: hips.getWorldPosition(point).y,
    leftSoleY,
    rightSoleY,
    joints,
    hands: readHandContacts(root),
  };
}
