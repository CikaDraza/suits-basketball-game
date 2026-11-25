import { config } from '../../game/data/gameConfig';
import { useActionButton } from '../touch-overlay/useActionButton';

export function useInboundPass() {
  return useActionButton('INBOUND', {
    pulseMs: config.player.modeCooldown * 1000,
    highlight: false,
  });
}
