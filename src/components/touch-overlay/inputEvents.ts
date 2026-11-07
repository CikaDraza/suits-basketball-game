import { GAME_INPUT_EVENT, type ActionId, type ActionPhase, type GameInputEvent } from './types';

/** One event contract for keyboard, joystick and on-screen action buttons. */
export function dispatchGameInput(
  action: ActionId,
  phase: ActionPhase,
  detail: Omit<GameInputEvent, 'action' | 'phase'> = {},
) {
  window.dispatchEvent(
    new CustomEvent<GameInputEvent>(GAME_INPUT_EVENT, {
      detail: { ...detail, action, phase },
    }),
  );
}

export function isEditableTarget(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    Boolean(
      target.closest(
        'input, textarea, select, button, a, [contenteditable=""], [contenteditable="true"]',
      ),
    )
  );
}
