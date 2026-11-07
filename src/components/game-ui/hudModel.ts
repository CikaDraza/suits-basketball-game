import { config } from '../../game/data/gameConfig';
import type { GameStore } from '../../game/state/gameStore';

export function isPerfectCharge(charge: number) {
  return Math.abs(charge - config.shots.perfectTime) <= config.shots.perfectWindow;
}

/** Derived labels subscribe as strings, so timer ticks do not rerender the whole HUD. */
export function selectActionHint(state: GameStore) {
  if (state.passType)
    return state.riskyPass
      ? 'RISKY LOB · WATCH THE GLASS'
      : state.passType === 'lob'
        ? 'LOB · MEET THE BALL'
        : 'CHEST PASS · MEET THE BALL';
  if (state.modes[0] === 'down') return 'MASH TO GET UP';
  if (state.inbound) {
    const mine = state.inbound.owner === 0;
    if (state.inbound.stage === 'POSITIONING')
      return mine
        ? state.modes[0] === 'post'
          ? 'SEAL · SHOW A HAND'
          : 'Q · SEAL & CALL FOR THE BALL'
        : 'FIGHT FOR POSITION';
    return mine ? '△ / Q · PASS IT IN' : 'DENY THE PASS';
  }
  if (state.owner !== 0) return 'HOLD TO CONTEST';
  if (state.handling[0] !== 'hold') return 'HOLD / RELEASE';
  return state.holdProgress > 0 ? 'MOVE → DRIBBLE' : 'TAP = JAB · HOLD = DRIBBLE';
}

export function selectHandlingLabel(state: GameStore) {
  if (state.passType) return state.passType === 'lob' ? 'LOB PASS' : 'CHEST PASS';
  if (state.inbound)
    return state.inbound.stage === 'POSITIONING' ? 'INBOUND · POSITION' : 'INBOUND · PASS';
  if (state.modes[0] !== 'idle') return state.modes[0].toUpperCase();
  if (state.owner !== 0) return 'ON DEFENSE';
  return state.handling[0] === 'hold' ? 'TRIPLE THREAT' : 'ON OFFENSE';
}

export const shotTargetStyle = {
  left: `${((config.shots.perfectTime - config.shots.perfectWindow) / config.shots.raiseDuration) * 100}%`,
  width: `${((config.shots.perfectWindow * 2) / config.shots.raiseDuration) * 100}%`,
};
