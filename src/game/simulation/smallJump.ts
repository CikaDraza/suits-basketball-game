import { config } from '../data/gameConfig';

export function createSmallJump() {
  return {
    phase: 'grounded' as 'grounded' | 'preparation' | 'airborne' | 'landing',
    elapsed: 0,
    airTime: 0,
    grounded: false,
    launched: false,
    airborneObserved: false,
    height: 0,
    verticalVelocity: 0,
    peakHeight: 0,
    takeoffs: 0,
    decision: 'none' as 'none' | 'accepted' | 'rejected',
    reason: '',
    commandId: 0,
    handToBallDistance: null as number | null,
    contactObserved: false,
    blockResult: 'no-target' as 'no-target' | 'out-of-reach' | 'contact-preview',
    blockApplied: false,
    context: 'vertical' as 'vertical' | 'block-preview' | 'rebound-ready',
  };
}
export type SmallJump = ReturnType<typeof createSmallJump>;
/** Support is measured from the Rapier capsule on this game's flat court. */
export function measureJump(state: SmallJump, bodyY: number, verticalVelocity: number) {
  state.height = Math.max(0, bodyY - config.physics.halfHeight - config.physics.radius);
  state.verticalVelocity = verticalVelocity;
  state.grounded =
    state.height < config.smallJump.groundedTolerance && Math.abs(verticalVelocity) < 0.3;
}
export function requestSmallJump(state: SmallJump, allowed: boolean) {
  state.decision = 'rejected';
  state.reason = !allowed
    ? 'gameplay-context'
    : state.phase !== 'grounded'
      ? state.phase
      : !state.grounded
        ? 'no-physical-support'
        : '';
  if (state.reason) return false;
  state.phase = 'preparation';
  state.elapsed = state.airTime = state.peakHeight = 0;
  state.launched = state.airborneObserved = state.contactObserved = state.blockApplied = false;
  state.decision = 'accepted';
  return true;
}
/** Returns a single requested takeoff; only Rapier can subsequently establish flight/landing. */
export function stepSmallJump(state: SmallJump, dt: number, allowed: boolean) {
  if (state.phase === 'grounded') return false;
  state.elapsed += dt;
  state.peakHeight = Math.max(state.peakHeight, state.height);
  if (state.phase === 'preparation') {
    if (!allowed && !state.launched) {
      state.phase = 'grounded';
      return false;
    }
    if (
      state.launched &&
      (state.height > config.smallJump.groundedTolerance || state.verticalVelocity > 0.3)
    ) {
      state.phase = 'airborne';
      state.airborneObserved = true;
      state.airTime = 0;
    } else if (!state.launched && state.elapsed >= config.smallJump.preparation) {
      if (!state.grounded) {
        state.phase = 'grounded';
        state.reason = 'support-lost';
        return false;
      }
      state.launched = true;
      state.takeoffs++;
      return true;
    } else if (
      state.launched &&
      state.grounded &&
      state.elapsed > config.smallJump.preparation + 0.18
    ) {
      state.phase = 'landing';
      state.elapsed = 0;
      state.reason = 'takeoff-blocked';
    }
  } else if (state.phase === 'airborne') {
    state.airTime += dt;
    if (state.grounded && state.verticalVelocity <= 0.3) {
      state.phase = 'landing';
      state.elapsed = 0;
    }
  } else if (state.elapsed >= config.smallJump.recovery) {
    state.phase = 'grounded';
    state.elapsed = 0;
  }
  return false;
}
