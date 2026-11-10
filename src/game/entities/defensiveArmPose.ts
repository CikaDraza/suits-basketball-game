import { config } from '../data/gameConfig';
import type { DefensiveArmMode } from '../input/defensiveHands';

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
  hands: DefensiveArmMode,
  time: number,
  pushProgress = 0,
) {
  if (hands === 'none') return;
  // A guarding base also owns the opposite arm during the entry/release blend.
  pose.lDown = pose.rDown = 1;
  pose.lPitch = pose.rPitch = -0.65;
  pose.lElbow = pose.rElbow = 1.45;
  pose.lIn = pose.rIn = 0;
  if (hands === 'ready') return;
  if (hands === 'left' || hands === 'wide') {
    pose.lDown = 0;
    pose.lPitch = 0;
    pose.lElbow = 0.2;
    pose.lIn = 0.15;
  }
  if (hands === 'right' || hands === 'wide') {
    pose.rDown = 0;
    pose.rPitch = 0;
    pose.rElbow = 0.2;
    pose.rIn = 0.15;
  }
  if (hands === 'left' || hands === 'right' || hands === 'wide') return;
  if (hands === 'brace' || hands === 'push') {
    const extension = hands === 'push' ? Math.sin(Math.PI * pushProgress) ** 2 : 0;
    pose.lPitch = pose.rPitch = -1.1 - extension * 0.3;
    pose.lElbow = pose.rElbow = 1.45 - extension;
    pose.lIn = pose.rIn = 0.25;
  } else {
    pose.lDown = pose.rDown = 1.3;
    pose.lElbow = pose.rElbow = 0.15;
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
