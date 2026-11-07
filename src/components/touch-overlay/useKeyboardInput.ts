import { useEffect } from 'react';
import { useGameStore } from '../../game/state/gameStore';
import { dispatchGameInput, isEditableTarget } from './inputEvents';
import { DEFAULT_KEY_MAP, type ActionId } from './types';

/** Mounted by App so Escape can resume the game while touch controls are hidden. */
export function useKeyboardInput() {
  useEffect(() => {
    const keysDown = new Set<string>();
    const emit = (action: ActionId, phase: 'down' | 'up') => {
      dispatchGameInput(action, phase, { source: 'keyboard' });
    };
    const releaseKeys = () => {
      const actions = new Set([...keysDown].map((code) => DEFAULT_KEY_MAP[code]));
      keysDown.clear();
      actions.forEach((action) => {
        if (action) emit(action, 'up');
      });
    };
    const onKeyDown = (event: KeyboardEvent) => {
      const action = DEFAULT_KEY_MAP[event.code];
      if (
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
      const alreadyPressed = [...keysDown].some((code) => DEFAULT_KEY_MAP[code] === action);
      keysDown.add(event.code);
      if (!alreadyPressed) emit(action, 'down');
    };
    const onKeyUp = (event: KeyboardEvent) => {
      const action = DEFAULT_KEY_MAP[event.code];
      if (!action || !keysDown.delete(event.code)) return;
      event.preventDefault();
      if (![...keysDown].some((code) => DEFAULT_KEY_MAP[code] === action)) emit(action, 'up');
    };
    const onVisibilityChange = () => {
      if (document.hidden) releaseKeys();
    };
    const unsubscribe = useGameStore.subscribe((state, previous) => {
      if (state.screen !== previous.screen || state.revision !== previous.revision) releaseKeys();
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
      releaseKeys();
    };
  }, []);
}
