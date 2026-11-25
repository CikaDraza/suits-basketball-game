import { AnimationClip, Bone, Object3D, PropertyBinding, Quaternion } from 'three';

function bonesByName(root: Object3D) {
  const bones = new Map<string, Bone>();
  root.traverse((node) => {
    if (!(node instanceof Bone)) return;
    if (bones.has(node.name)) throw new Error(`Duplicate animation bone: ${node.name}`);
    bones.set(node.name, node);
  });
  return bones;
}

/** Validate direct playback; a different rig needs explicit retargeting first. */
export function bindAnimationClip(source: Object3D, target: Object3D, clip: AnimationClip) {
  const sourceBones = bonesByName(source);
  const targetBones = bonesByName(target);
  if (!sourceBones.size || sourceBones.size !== targetBones.size)
    throw new Error('Animation skeleton bone counts differ');
  source.updateMatrixWorld(true);
  target.updateMatrixWorld(true);
  let maxPositionDelta = 0;
  let maxAngleDelta = 0;
  let maxScaleDelta = 0;
  let maxWorldMatrixDelta = 0;
  const sourceRotation = new Quaternion();
  const targetRotation = new Quaternion();
  for (const [name, bone] of sourceBones) {
    const destination = targetBones.get(name);
    if (!destination) throw new Error(`Missing animation bone: ${name}`);
    const parentName = (node: Bone) => (node.parent instanceof Bone ? node.parent.name : null);
    if (parentName(bone) !== parentName(destination))
      throw new Error(`Animation bone hierarchy differs: ${name}`);
    maxPositionDelta = Math.max(maxPositionDelta, bone.position.distanceTo(destination.position));
    maxAngleDelta = Math.max(
      maxAngleDelta,
      sourceRotation
        .copy(bone.quaternion)
        .normalize()
        .angleTo(targetRotation.copy(destination.quaternion).normalize()),
    );
    maxScaleDelta = Math.max(maxScaleDelta, bone.scale.distanceTo(destination.scale));
    for (let i = 0; i < 16; i++)
      maxWorldMatrixDelta = Math.max(
        maxWorldMatrixDelta,
        Math.abs(bone.matrixWorld.elements[i] - destination.matrixWorld.elements[i]),
      );
  }
  if (
    ![maxPositionDelta, maxAngleDelta, maxScaleDelta, maxWorldMatrixDelta].every(Number.isFinite) ||
    maxPositionDelta > 0.0001 ||
    maxAngleDelta > 0.001 ||
    maxScaleDelta > 0.0001 ||
    maxWorldMatrixDelta > 0.001
  )
    throw new Error('Animation rest transforms differ; retargeting is required');
  if (!Number.isFinite(clip.duration) || clip.duration <= 0 || !clip.tracks.length)
    throw new Error('Animation clip is empty or has invalid duration');
  const tracks = clip.tracks.map((track) => {
    const parsed = PropertyBinding.parseTrackName(track.name);
    const bone = PropertyBinding.findNode(source, parsed.nodeName);
    if (
      !(bone instanceof Bone) ||
      !sourceBones.has(bone.name) ||
      !['position', 'quaternion', 'scale'].includes(parsed.propertyName) ||
      parsed.objectName ||
      parsed.propertyIndex !== undefined
    )
      throw new Error(`Unsupported animation track: ${track.name}`);
    if (![...track.times, ...track.values].every(Number.isFinite))
      throw new Error(`Non-finite animation track: ${track.name}`);
    const copy = track.clone();
    // Bind only to the validated destination; never attach the source mesh/rig.
    copy.name = `${targetBones.get(bone.name)!.uuid}.${parsed.propertyName}`;
    return copy;
  });
  return {
    clip: new AnimationClip(clip.name, clip.duration, tracks, clip.blendMode),
    report: {
      bones: targetBones.size,
      tracks: tracks.length,
      maxPositionDelta,
      maxAngleDelta,
      maxScaleDelta,
      maxWorldMatrixDelta,
    },
  };
}
