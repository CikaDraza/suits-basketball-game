import { config } from '../data/gameConfig';
import { clamp } from '../utils/math';

const smooth = (n: number) => n * n * (3 - 2 * n);
/** Shared presentation timing; extension never authorizes a physical hit. */
export function defensivePushPose(progress: number) {
  const seconds = clamp(progress, 0, 1) * config.defense.hands.pushDuration;
  const {
    pushPreparation: prep,
    pushExtension: extend,
    pushDuration: total,
  } = config.defense.hands;
  if (seconds < prep)
    return { phase: 'preparation' as const, extension: 0, contact: smooth(seconds / prep) };
  if (seconds < prep + extend)
    return {
      phase: 'extension' as const,
      extension: smooth((seconds - prep) / extend),
      contact: 1,
    };
  const recovery = smooth((seconds - prep - extend) / (total - prep - extend));
  return { phase: 'recovery' as const, extension: 1 - recovery, contact: 1 - recovery };
}
