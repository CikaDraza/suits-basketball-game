import { useEffect } from 'react';
import { useGameStore } from '../../game/state/gameStore';
import { dispatchGameInput, isEditableTarget } from './inputEvents';
import { type ActionId } from './types';
import { keyAction } from '../../game/input/controlBindings';
import { readControlContext } from '../../game/input/controlContext';
import { useControlSettingsStore } from '../../game/state/controlSettingsStore';

/** Mounted by App so Escape can resume the game while touch controls are hidden. */
export function useKeyboardInput() {
  useEffect(() => {
    const keysDown = new Map<string, ActionId>();
    const mapped = (code: string) =>
      keyAction(useControlSettingsStore.getState().profile[readControlContext()], code);
    const emit = (action: ActionId, phase: 'down' | 'up') => {
      dispatchGameInput(action, phase, { source: 'keyboard' });
    };
    const releaseKeys = () => {
      const actions = new Set(keysDown.values());
      keysDown.clear();
      actions.forEach((action) => {
        if (action) emit(action, 'up');
      });
    };
    const onKeyDown = (event: KeyboardEvent) => {
      const action = mapped(event.code);
      if (
        useControlSettingsStore.getState().capturing ||
        !action ||
        (action !== 'PAUSE' && isEditableTarget(event.target)) ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey
      )
        return;
      if (action !== 'PAUSE' && useGameStore.getState().screen !== 'playing') return;
      event.preventDefault();
      if (event.repeat || keysDown.has(event.code)) return;
      const alreadyPressed = [...keysDown.values()].includes(action);
      keysDown.set(event.code, action);
      if (!alreadyPressed) emit(action, 'down');
    };
    const onKeyUp = (event: KeyboardEvent) => {
      const action = keysDown.get(event.code);
      if (!action || !keysDown.delete(event.code)) return;
      event.preventDefault();
      if (![...keysDown.values()].includes(action)) emit(action, 'up');
    };
    const onVisibilityChange = () => {
      if (document.hidden) releaseKeys();
    };
    const unsubscribe = useGameStore.subscribe((state, previous) => {
      if (state.screen !== previous.screen || state.revision !== previous.revision) releaseKeys();
    });

    const unsubscribeBindings = useControlSettingsStore.subscribe((s, p) => {
      if (s.profile !== p.profile || s.capturing !== p.capturing) releaseKeys();
    });
    window.addEventListener('keydown', onKeyDown, { passive: false });
    window.addEventListener('keyup', onKeyUp, { passive: false });
    window.addEventListener('blur', releaseKeys);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', releaseKeys);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      unsubscribe();
      unsubscribeBindings();
      releaseKeys();
    };
  }, []);
}
