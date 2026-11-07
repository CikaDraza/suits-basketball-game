import { useGameStore } from '../state/gameStore';

/** Read transient state without subscribing a React component to simulation updates. */
export function isSimulationRunning(): boolean {
  return (
    useGameStore.getState().screen === 'playing' &&
    (typeof window === 'undefined' || window.__PAUSED__ !== true)
  );
}
