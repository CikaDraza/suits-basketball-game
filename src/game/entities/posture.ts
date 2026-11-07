/*
 * Orthogonal animation states DERIVED from the existing gameplay state (Duel/Fighter).
 * Nothing here is authoritative: there is no second state machine to keep in sync.
 *
 *   Locomotion  idle | forward | backward | strafe      ← gait.ts (measured body velocity)
 *   Posture     upright | defensive | post              ← this file
 *   Upper body  relaxed | callForPass | hold | dribble | deny | guard
 *
 * Joint ownership (see Character.tsx):
 *   legs + pelvis height  → posture + gait foot IK (grounded states)
 *   arms                  → hand IK while hold/dribble/incoming (Slice 2), else this layer
 *   spine/head            → this layer (lean, chest/head turn toward the ball)
 */

export type Posture = 'upright' | 'defensive' | 'post';
export type UpperBody = 'relaxed' | 'callForPass' | 'hold' | 'dribble' | 'deny' | 'guard';
export type CallForPassFallback = 'none' | 'movement' | 'window';

export interface PostureInput {
  mode: string;
  /** this slot controls the ball (held) */
  controlled: boolean;
  handling: 'hold' | 'dribble';
  /** the incoming inbound pass is close enough to reach for */
  receiving: boolean;
  ballState: string;
  inboundOwner: number;
  inboundStage: 'position' | 'pass';
  slot: number;
  /** the opponent controls a held ball */
  opponentHasBall: boolean;
  opponentDistance: number;
  guardRange: number;
  /** seconds since this slot explicitly asked for the inbound pass (Infinity if never) */
  sinceRequest: number;
  /** seconds since the receiver last cut at speed (Infinity if never) */
  sinceCut: number;
  callForPass: { fallback: CallForPassFallback; requestHold: number; cutHold: number };
}

export interface DerivedStates {
  posture: Posture;
  upper: UpperBody;
}

export function deriveStates(s: PostureInput): DerivedStates {
  const post = s.mode === 'post';
  if (s.controlled || s.receiving)
    return {
      posture: post ? 'post' : 'upright',
      upper: s.controlled && s.handling === 'dribble' ? 'dribble' : 'hold',
    };
  const inbound = s.ballState === 'inbound' || s.ballState === 'pass';
  if (inbound && s.inboundOwner === s.slot) {
    // off-ball receiver: an explicit request always raises the hand; the configurable
    // fallback raises it during the pass window (whole window, or after a cut)
    const window = s.ballState === 'inbound' && s.inboundStage === 'pass';
    const call =
      s.sinceRequest < s.callForPass.requestHold ||
      (!post &&
        window &&
        (s.callForPass.fallback === 'window' ||
          (s.callForPass.fallback === 'movement' && s.sinceCut < s.callForPass.cutHold)));
    return { posture: post ? 'post' : 'upright', upper: call ? 'callForPass' : 'relaxed' };
  }
  if (inbound) return { posture: post ? 'post' : 'defensive', upper: 'deny' };
  if (s.opponentHasBall && s.opponentDistance < s.guardRange && s.mode !== 'contest')
    return { posture: post ? 'post' : 'defensive', upper: 'guard' };
  return { posture: post ? 'post' : 'upright', upper: 'relaxed' };
}
