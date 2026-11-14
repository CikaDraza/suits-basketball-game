import { isFreeMovement, useGameStore } from '../state/gameStore';
import type { ControlContext } from './controlBindings';
let reader: (slot: number) => ControlContext = (slot) => {
  const s = useGameStore.getState();
  if (isFreeMovement(s.session)) return 'defense';
  return (s.inbound?.owner ?? s.owner) === slot ? 'offense' : 'defense';
};
/** Read the authoritative runtime through an adapter, without importing Duel in UI/input modules. */
export function setControlContextReader(next: typeof reader) {
  reader = next;
}
export function readControlContext(slot = 0) {
  return reader(slot);
}
