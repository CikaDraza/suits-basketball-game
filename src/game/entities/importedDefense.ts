import { Bone, Object3D, PropertyBinding, Quaternion, QuaternionLinearInterpolant } from 'three';
import type { AnimationClip } from 'three';
import { bindAnimationClip } from '../assets/animationClip';
import { config } from '../data/gameConfig';

export const SHAQ_DEFENSE_CLIP = 'SHAQ_DEFENSE_SEQUENCE_V01';
const LOWER = /^mixamorig:?(Hips|(Left|Right)(UpLeg|Leg|Foot|ToeBase|Toe_End))$/;
const smooth = (x: number) => x * x * (3 - 2 * x);

/** One presentation layer in Character's pose pass; never moves the capsule or source rig. */
export function createImportedDefense(
  model: Object3D,
  source: Object3D,
  clips: readonly AnimationClip[],
) {
  const sourceClip = clips.find((clip) => clip.name === SHAQ_DEFENSE_CLIP);
  if (!sourceClip) throw new Error(`Missing animation clip: ${SHAQ_DEFENSE_CLIP}`);
  const { clip } = bindAnimationClip(source, model, sourceClip);
  const tracks = clip.tracks.flatMap((track) => {
    const parsed = PropertyBinding.parseTrackName(track.name);
    if (parsed.propertyName !== 'quaternion') return [];
    const bone = PropertyBinding.findNode(model, parsed.nodeName);
    if (!(bone instanceof Bone)) throw new Error(`Missing defense bone: ${track.name}`);
    return [
      {
        bone,
        lower: LOWER.test(bone.name),
        rest: bone.quaternion.clone(),
        from: bone.quaternion.clone(),
        sample: new QuaternionLinearInterpolant(track.times, track.values, 4, new Float32Array(4)),
      },
    ];
  });
  const tuning = config.animation.importedDefense;
  const sampled = new Quaternion();
  const blended = new Quaternion();
  let requested = false;
  let transition = tuning.blendDuration;
  const debug = {
    clip: clip.name,
    source: 'imported-defense',
    requested: false,
    phase: 'inactive' as 'inactive' | 'enter' | 'playing' | 'hold' | 'exit',
    time: 0,
    duration: clip.duration,
    weight: 0,
    lowerWeight: 0,
    applied: 0,
    appliedLower: 0,
  };
  return {
    debug,
    resetPose() {
      for (const track of tracks) track.bone.quaternion.copy(track.rest);
    },
    step(dt: number, wantStance: boolean, allowed: boolean, moving: boolean, reset: boolean) {
      debug.applied = debug.appliedLower = 0;
      debug.requested = wantStance;
      if (reset || !allowed) {
        requested = false;
        transition = tuning.blendDuration;
        debug.phase = 'inactive';
        debug.weight = debug.lowerWeight = debug.time = 0;
        if (!allowed) return;
      }
      if (wantStance !== requested) {
        // Capture the previous final pose BEFORE procedural FK/IK is rebuilt. Entry
        // therefore starts at the visible walk pose, including its toe/finger bones.
        for (const track of tracks) track.from.copy(reset ? track.rest : track.bone.quaternion);
        requested = wantStance;
        transition = 0;
        if (requested) debug.time = 0;
      }
      transition = Math.min(tuning.blendDuration, transition + dt);
      const alpha = smooth(transition / tuning.blendDuration);
      debug.weight = requested ? alpha : 1 - alpha;
      if (requested) {
        debug.time = Math.min(clip.duration, debug.time + dt);
        debug.lowerWeight +=
          (Number(!moving) - debug.lowerWeight) * (1 - Math.exp(-tuning.lowerBlendRate * dt));
        if (debug.lowerWeight < 0.001) debug.lowerWeight = 0;
        debug.phase = alpha < 1 ? 'enter' : debug.time >= clip.duration ? 'hold' : 'playing';
      } else {
        debug.phase = debug.weight > 0 ? 'exit' : 'inactive';
        if (debug.weight === 0) debug.lowerWeight = 0;
      }
    },
    apply() {
      if (debug.phase === 'inactive') return;
      for (const track of tracks) {
        const lowerInfluence = requested
          ? 1 - debug.weight + debug.weight * debug.lowerWeight
          : debug.weight;
        if (track.lower && lowerInfluence < 0.001) continue;
        if (requested) {
          sampled.fromArray(track.sample.evaluate(debug.time)).normalize();
          if (track.lower) {
            // Moving feet retain the gait/IK result; only the stationary stance
            // receives authored hips/legs. Scale and translation are never copied.
            blended.copy(track.bone.quaternion).slerp(sampled, debug.lowerWeight);
            sampled.copy(blended);
          }
          track.bone.quaternion.slerpQuaternions(track.from, sampled, debug.weight);
        } else track.bone.quaternion.slerp(track.from, debug.weight);
        debug.applied++;
        if (track.lower) debug.appliedLower++;
      }
    },
  };
}
