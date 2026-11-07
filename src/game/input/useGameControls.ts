import { useEffect } from 'react';
import { GAME_INPUT_EVENT, type GameInputEvent } from '../../components/touch-overlay/types';
import { useInputBridge } from '../../components/touch-overlay/useInputBridge';
import { useKeyboardInput } from '../../components/touch-overlay/useKeyboardInput';
import { lockLandscape } from './orientation';
import { closeAudio, enableAudio } from '../audio/audio';
import { useGamepadPause } from './useGamepadPause';
import { useGameStore } from '../state/gameStore';

export function unlockGame(): void {
  enableAudio();
  void lockLandscape();
}

/** Input stays mounted while the Canvas suspends and while menus are open. */
export function useGameControls(): void {
  useInputBridge();
  useGamepadPause();
  useKeyboardInput();

  useEffect(() => {
    function handlePause(event: Event): void {
      const { action, phase } = (event as CustomEvent<GameInputEvent>).detail;
      if (action !== 'PAUSE' || phase !== 'down') return;

      const state = useGameStore.getState();
      if (state.screen === 'playing') state.pause();
      else if (state.screen === 'paused') state.resume();
    }

    window.addEventListener(GAME_INPUT_EVENT, handlePause);
    return () => {
      window.removeEventListener(GAME_INPUT_EVENT, handlePause);
      closeAudio();
    };
  }, []);
}
