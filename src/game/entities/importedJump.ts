import {
  Bone,
  PropertyBinding,
  Quaternion,
  QuaternionLinearInterpolant,
  type AnimationClip,
  type Object3D,
} from 'three';
import { bindAnimationClip } from '../assets/animationClip';
import { config } from '../data/gameConfig';
import type { SmallJump } from '../simulation/smallJump';

export const SMALL_JUMP_CLIP = 'SHAQ_SMALL_BLOCK_JUMP_V01';
/** Quaternion-only posing in the existing Character pass. Root motion never reaches Rapier. */
export function createImportedJump(
  model: Object3D,
  source: Object3D,
  clips: readonly AnimationClip[],
) {
  const original = clips.find((clip) => clip.name === SMALL_JUMP_CLIP);
  if (!original) throw new Error(`Missing verified jump: ${SMALL_JUMP_CLIP}`);
  const { clip } = bindAnimationClip(source, model, original);
  const tracks = clip.tracks.flatMap((track) => {
    const parsed = PropertyBinding.parseTrackName(track.name);
    if (parsed.propertyName !== 'quaternion') return [];
    const bone = PropertyBinding.findNode(model, parsed.nodeName);
    if (!(bone instanceof Bone)) throw new Error(`Missing jump bone: ${track.name}`);
    return [
      {
        bone,
        lower: /(?:Left|Right)(?:UpLeg|Leg|Foot|ToeBase)/.test(bone.name),
        from: bone.quaternion.clone(),
        sample: new QuaternionLinearInterpolant(track.times, track.values, 4, new Float32Array(4)),
      },
    ];
  });
  const sampled = new Quaternion();
  let active = false,
    transition = config.smallJump.blendDuration;
  const debug = {
    clip: clip.name,
    phase: 'inactive',
    time: 0,
    duration: clip.duration,
    weight: 0,
    applied: 0,
    appliedUpper: 0,
  };
  return {
    debug,
    step(dt: number, jump: SmallJump, allowed: boolean, reset: boolean) {
      debug.applied = 0;
      debug.appliedUpper = 0;
      const requested = allowed && jump.phase !== 'grounded';
      if (reset) {
        active = false;
        debug.weight = 0;
        transition = config.smallJump.blendDuration;
      }
      if (requested !== active) {
        tracks.forEach((track) => track.from.copy(track.bone.quaternion));
        active = requested;
        transition = 0;
      }
      transition = Math.min(config.smallJump.blendDuration, transition + dt);
      const alpha = transition / config.smallJump.blendDuration,
        ease = alpha * alpha * (3 - 2 * alpha);
      debug.weight = active ? ease : 1 - ease;
      debug.phase = active ? jump.phase : debug.weight > 0 ? 'exit' : 'inactive';
      // Pose phases follow physical flight and landing, not the other way around.
      debug.time =
        jump.phase === 'preparation'
          ? Math.min(0.24, (jump.elapsed / config.smallJump.preparation) * 0.24)
          : jump.phase === 'airborne'
            ? 0.24 + Math.min(1, jump.airTime / config.smallJump.visualFlightDuration) * 0.4
            : jump.phase === 'landing'
              ? 0.64 +
                Math.min(1, jump.elapsed / config.smallJump.recovery) * (clip.duration - 0.64)
              : debug.time;
    },
    apply(ballContactOwnsUpperBody = false) {
      if (debug.weight <= 0) return;
      for (const track of tracks) {
        // The one-arm block capture moves the shoulder girdle outside a
        // two-hand grip's reach. Hold/catch retains its procedural torso and
        // shoulders; the jump still poses the legs and Rapier moves the body.
        if (ballContactOwnsUpperBody && !track.lower) continue;
        if (active) {
          sampled.fromArray(track.sample.evaluate(debug.time)).normalize();
          track.bone.quaternion.slerpQuaternions(track.from, sampled, debug.weight);
        } else track.bone.quaternion.slerp(track.from, debug.weight);
        debug.applied++;
        if (!track.lower) debug.appliedUpper++;
      }
    },
  };
}
