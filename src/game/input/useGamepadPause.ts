import { motionAudit } from '../diagnostics/motionAudit';
import { useEffect } from 'react';
import { useGameStore } from '../state/gameStore';
import { useControlSettingsStore } from '../state/controlSettingsStore';
import { readControlContext } from './controlContext';
import { getPadNeutral, isPadNeutral, nthConnectedPad, readGamepadInput } from './gamepadInput';
/** Runs while physics is paused too; a learned/held button cannot immediately close the menu. */
export function useGamepadPause() {
  useEffect(() => {
    let blocked = true;
    const previous = [false, false];
    const unsubscribe = useControlSettingsStore.subscribe((next, old) => {
      if (next.capturing || next.profile !== old.profile) blocked = true;
    });
    const timer = window.setInterval(() => {
      const settings = useControlSettingsStore.getState();
      const pads = navigator.getGamepads?.() ?? [];
      if (settings.capturing) {
        blocked = true;
        return;
      }
      if (blocked) {
        const neutral = Array.from(pads).every(
          (p) =>
            !p?.connected ||
            isPadNeutral(p, settings.profile.deadzone + 0.03, getPadNeutral(settings.profile, p)),
        );
        if (!neutral) return;
        blocked = false;
        previous.fill(false);
      }
      for (let slot = 0; slot < 2; slot++) {
        const pad = nthConnectedPad(pads, slot);
        const pressed = readGamepadInput(
          pad,
          settings.profile[readControlContext(slot)],
          settings.profile.deadzone,
          getPadNeutral(settings.profile, pad),
        ).pause;
        if (pressed && !previous[slot]) {
          if (import.meta.env.DEV)
            motionAudit.input(
              'gamepad-pause',
              {
                device: pad?.id,
                bindings: settings.profile[readControlContext(slot)].gamepad.PAUSE,
                action: 'PAUSE',
              },
              slot,
            );
          const game = useGameStore.getState();
          if (game.screen === 'playing') game.pause();
          else if (game.screen === 'paused') game.resume();
        }
        previous[slot] = pressed;
      }
    }, 33);
    const onBlur = () => {
      blocked = true;
      previous.fill(false);
    };
    window.addEventListener('blur', onBlur);
    return () => {
      window.clearInterval(timer);
      unsubscribe();
      window.removeEventListener('blur', onBlur);
    };
  }, []);
}
