import { useCallback, useEffect, useRef, useState } from 'react';
import { getPadNeutral, isPadNeutral, pressedPadBinding } from '../../game/input/gamepadInput';
import type {
  ControlAction,
  ControlContext,
  InputDevice,
  TouchSlot,
} from '../../game/input/controlBindings';
import { useControlSettingsStore } from '../../game/state/controlSettingsStore';

/** Learning is a menu interaction: the learned gesture never reaches gameplay. */
export function useControlCapture(
  context: ControlContext,
  device: InputDevice,
  padIndex: number | undefined,
  deadzone: number,
) {
  const [action, setAction] = useState<ControlAction | null>(null);
  const [message, setMessage] = useState('Izaberi akciju da promeniš mapiranje.');
  const phase = useRef<'listen' | 'release'>('listen');
  const learnedKey = useRef('');
  const finish = useCallback((text = 'Promena je sačuvana.') => {
    phase.current = 'listen';
    learnedKey.current = '';
    setAction(null);
    setMessage(text);
    useControlSettingsStore.getState().setCapturing(false);
  }, []);
  const cancel = useCallback(() => finish('Podešavanje je otkazano.'), [finish]);
  const arm = useCallback(
    (next: ControlAction) => {
      phase.current = 'listen';
      learnedKey.current = '';
      setAction(next);
      setMessage(
        device === 'keyboard'
          ? 'Pritisni novi taster. Esc odustaje.'
          : device === 'gamepad'
            ? next.startsWith('SKILL_')
              ? 'Pusti komande, pa pomeri desnu palicu u izabrani smer (Axis). Esc odustaje.'
              : 'Pusti komande, pa pritisni dugme ili pomeri jednu palicu. Esc odustaje.'
            : 'Dodirni dugme u prikazu ispod.',
      );
      useControlSettingsStore.getState().setCapturing(true);
    },
    [device],
  );

  useEffect(
    () => () => {
      useControlSettingsStore.getState().setCapturing(false);
    },
    [],
  );
  useEffect(() => {
    if (!action) return;
    const onKeyDown = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (event.code === 'Escape') {
        cancel();
        return;
      }
      if (device !== 'keyboard' || phase.current !== 'listen' || event.repeat || !event.code)
        return;
      useControlSettingsStore.getState().bindKey(context, action, event.code);
      useControlSettingsStore.getState().setCapturing(true);
      learnedKey.current = event.code;
      phase.current = 'release';
      setMessage('Sačuvano. Pusti taster.');
    };
    const onKeyUp = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (device === 'keyboard' && phase.current === 'release' && event.code === learnedKey.current)
        finish();
    };
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('keyup', onKeyUp, true);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('keyup', onKeyUp, true);
    };
  }, [action, context, device, cancel, finish]);

  useEffect(() => {
    if (!action || device !== 'gamepad') return;
    let armed = false;
    let neutralAxes: readonly number[] | undefined;
    const timer = window.setInterval(() => {
      const pad = padIndex === undefined ? null : navigator.getGamepads?.()[padIndex];
      if (!pad?.connected) {
        if (phase.current === 'release') finish('Veza je sačuvana. Kontroler je odspojen.');
        return;
      }
      const baseline = getPadNeutral(useControlSettingsStore.getState().profile, pad);
      const neutral = isPadNeutral(pad, deadzone + 0.05, baseline);
      if (phase.current === 'release') {
        if (neutral) finish();
        return;
      }
      if (!armed) {
        armed = neutral;
        if (neutral) neutralAxes = baseline ?? Array.from(pad.axes);
        return;
      }
      const binding = pressedPadBinding(pad, neutralAxes, action.startsWith('SKILL_'));
      if (!binding) return;
      useControlSettingsStore.getState().bindPad(context, action, binding);
      useControlSettingsStore.getState().setCapturing(true);
      phase.current = 'release';
      setMessage('Sačuvano. Pusti dugme ili vrati palicu u sredinu.');
    }, 32);
    return () => window.clearInterval(timer);
  }, [action, context, device, padIndex, deadzone, finish]);

  const bindTouch = useCallback(
    (slot: TouchSlot) => {
      if (!action || device !== 'mobile') return;
      useControlSettingsStore.getState().bindTouch(context, action, slot);
      finish();
    },
    [action, context, device, finish],
  );
  return { action, message, arm, cancel, bindTouch, finish };
}
