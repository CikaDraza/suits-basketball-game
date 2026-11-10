import { useCallback, useEffect, useRef, type KeyboardEvent, type PointerEvent } from 'react';
import { dispatchGameInput } from './inputEvents';
import type { ActionId } from './types';

interface ActionButtonOptions {
  pulseMs?: number;
  control?: string;
  highlight?: boolean;
}

/** Shared pointer, keyboard, cancellation and optional pulse lifecycle for action controls. */
export function useActionButton(
  action: ActionId,
  { pulseMs, highlight = true, control }: ActionButtonOptions = {},
) {
  const pressed = useRef(false);
  const pointerId = useRef<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const release = useCallback(() => {
    pointerId.current = null;
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
    if (!pressed.current) return;
    pressed.current = false;
    if (highlight && button.current) button.current.style.background = 'rgba(255,255,255,0.1)';
    dispatchGameInput(action, 'up', { source: 'touch', control });
  }, [action, highlight, control]);
  const press = useCallback(() => {
    if (pressed.current) return;
    pressed.current = true;
    if (highlight && button.current) button.current.style.background = 'rgba(255,255,255,0.25)';
    dispatchGameInput(action, 'down', { source: 'touch', control });
    if (pulseMs !== undefined) timer.current = setTimeout(release, pulseMs);
  }, [action, highlight, pulseMs, release, control]);
  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.hidden) release();
    };
    window.addEventListener('blur', release);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.removeEventListener('blur', release);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      release();
    };
  }, [release]);

  return {
    ref: button,
    onPointerDown(event: PointerEvent<HTMLButtonElement>) {
      event.preventDefault();
      if (pressed.current) return;
      pointerId.current = event.pointerId;
      event.currentTarget.setPointerCapture(event.pointerId);
      press();
    },
    onPointerUp(event: PointerEvent<HTMLButtonElement>) {
      if (event.pointerId === pointerId.current) release();
    },
    onPointerCancel(event: PointerEvent<HTMLButtonElement>) {
      if (event.pointerId === pointerId.current) release();
    },
    onLostPointerCapture(event: PointerEvent<HTMLButtonElement>) {
      if (event.pointerId === pointerId.current) release();
    },
    onBlur: release,
    onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
      if (event.code === 'Space' || event.code === 'Enter') {
        event.preventDefault();
        if (!event.repeat) press();
      }
    },
    onKeyUp(event: KeyboardEvent<HTMLButtonElement>) {
      if (event.code === 'Space' || event.code === 'Enter') {
        event.preventDefault();
        release();
      }
    },
  };
}
