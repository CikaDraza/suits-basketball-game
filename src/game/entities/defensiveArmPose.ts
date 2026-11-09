import { config } from '../data/gameConfig';
import type { DefensiveHands } from '../input/defensiveHands';

export interface DefensiveArmPose {
  lDown: number;
  lPitch: number;
  lElbow: number;
  lIn: number;
  rDown: number;
  rPitch: number;
  rElbow: number;
  rIn: number;
}

/** FK targets only; the existing character blend owns smooth transitions. */
export function applyDefensiveArmPose(
  pose: DefensiveArmPose,
  hands: DefensiveHands,
  time: number,
  pushProgress = 0,
) {
  if (hands === 'none') return;
  pose.lDown = pose.rDown = 1.3;
  pose.lPitch = pose.rPitch = 0;
  pose.lElbow = pose.rElbow = 0.15;
  pose.lIn = pose.rIn = 0;
  if (hands === 'left') {
    pose.lDown = 0;
    pose.lElbow = 0.4;
    pose.lIn = 0.15;
  } else if (hands === 'right') {
    pose.rDown = 0;
    pose.rElbow = 0.4;
    pose.rIn = 0.15;
  } else if (hands === 'brace' || hands === 'push') {
    const extension = hands === 'push' ? Math.sin(Math.PI * pushProgress) ** 2 : 0;
    pose.lPitch = pose.rPitch = -1.1 - extension * 0.3;
    pose.lElbow = pose.rElbow = 1.45 - extension;
    pose.lIn = pose.rIn = 0.25;
  } else {
    pose.lPitch = pose.rPitch = -3.05;
    if (hands === 'wave') {
      const wave = Math.sin(time * config.defense.hands.waveRate * Math.PI * 2);
      const amplitude = config.defense.hands.waveAmplitude;
      pose.lDown += wave * amplitude;
      pose.rDown -= wave * amplitude;
      pose.lPitch += wave * amplitude * 0.5;
      pose.rPitch -= wave * amplitude * 0.5;
      pose.lElbow += (1 + wave) * amplitude * 0.4;
      pose.rElbow += (1 - wave) * amplitude * 0.4;
    }
  }
}
