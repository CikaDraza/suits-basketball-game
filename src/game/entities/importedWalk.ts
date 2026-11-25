import {
  Bone,
  PropertyBinding,
  Quaternion,
  QuaternionLinearInterpolant,
  type AnimationClip,
  type Object3D,
} from 'three';

const LEG = /^(Left|Right)(UpLeg|Leg|Foot|ToeBase|Toe_End)$/;
const ARM = /^(Left|Right)(Shoulder|Arm|ForeArm|Hand)$/;

/** Remove the source FBX branch from this clone, before any rig/sole/hand inspection. */
export function isolateWalkingCharacter(model: Object3D) {
  const root = model.getObjectByName('shaquille_oneal_Meters');
  if (!root) throw new Error('Walking test: primary Shaq hierarchy is missing');
  const keep = new Set<Object3D>();
  for (let node: Object3D | null = root; node; node = node.parent) keep.add(node);
  for (const child of [...model.children]) if (!keep.has(child)) model.remove(child);
}

/**
 * Distance-sample the authored quaternion tracks in Character's existing pose pass.
 * No second mixer/clock or rigid-body translation; hand IK is applied afterwards.
 */
export function createImportedWalk(model: Object3D, clips: readonly AnimationClip[]) {
  const clip = clips.find((candidate) => /Retarget$/i.test(candidate.name));
  if (!clip) throw new Error('Walking test: retargeted walking clip is missing');
  const start = 1 / 30; // Export's first key repeats a mid-cycle pose; use the coherent full cycle.
  const duration = clip.duration - start;
  if (duration <= 0) throw new Error('Walking test: clip is too short');
  const hipsPosition = clip.tracks.find((track) => track.name === 'mixamorigHips.position');
  if (!hipsPosition) throw new Error('Walking test: cannot measure authored cycle distance');
  const values = hipsPosition.values;
  const cycleDistance = Math.hypot(
    values[values.length - 3] - values[3],
    values[values.length - 1] - values[5],
  );
  if (cycleDistance < 0.1) throw new Error('Walking test: invalid authored cycle distance');
  const tracks = clip.tracks.flatMap((track) => {
    const parsed = PropertyBinding.parseTrackName(track.name);
    if (parsed.propertyName !== 'quaternion') return [];
    const bone = PropertyBinding.findNode(model, parsed.nodeName);
    if (!(bone instanceof Bone)) return [];
    const name = bone.name.replace(/^mixamorig:?/, '');
    if (!LEG.test(name) && !ARM.test(name)) return [];
    return [
      {
        bone,
        arm: ARM.test(name),
        rest: bone.quaternion.clone(),
        sample: new QuaternionLinearInterpolant(track.times, track.values, 4, new Float32Array(4)),
      },
    ];
  });
  const quaternion = new Quaternion();
  const debug = {
    clip: clip.name,
    source: 'imported-walk',
    weight: 0,
    phase: 0,
    time: start,
    cycleDistance,
    applied: 0,
    appliedArms: 0,
  };
  return {
    debug,
    resetPose() {
      tracks.forEach(({ bone, rest }) => bone.quaternion.copy(rest));
    },
    step(dt: number, forwardTravel: number, eligible: boolean, reset: boolean) {
      debug.applied = 0;
      debug.appliedArms = 0;
      if (reset) {
        debug.weight = 0;
        debug.phase = 0;
      }
      const active = eligible && !reset;
      debug.weight += (Number(active) - debug.weight) * (1 - Math.exp(-12 * dt));
      if (debug.weight < 0.001) debug.weight = 0;
      if (active) debug.phase = (debug.phase + Math.max(0, forwardTravel) / cycleDistance) % 1;
      debug.time = start + debug.phase * duration;
    },
    apply(relaxedArms: boolean) {
      debug.applied = 0;
      debug.appliedArms = 0;
      if (debug.weight === 0) return;
      for (const track of tracks) {
        if (track.arm && !relaxedArms) continue;
        quaternion.fromArray(track.sample.evaluate(debug.time)).normalize();
        track.bone.quaternion.slerp(quaternion, debug.weight);
        debug.applied++;
        if (track.arm) debug.appliedArms++;
      }
    },
  };
}
