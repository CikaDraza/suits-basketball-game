import { useCallback, useEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react';
import { dispatchGameInput } from './inputEvents';
import type { ActionId } from './types';

const directions = ['left', 'right', 'up', 'down'] as const;
const directionActions: Record<(typeof directions)[number], ActionId> = {
  left: 'MOVE_LEFT',
  right: 'MOVE_RIGHT',
  up: 'MOVE_UP',
  down: 'MOVE_DOWN',
};

interface JoystickOptions {
  enabled: boolean;
  deadzone: number;
  threshold: number;
  analogOnly: boolean;
}

export function useJoystickInput({ enabled, deadzone, threshold, analogOnly }: JoystickOptions) {
  const baseRef = useRef<HTMLDivElement>(null);
  const knobRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef({
    pointerId: null as number | null,
    centerX: 0,
    centerY: 0,
    radius: 1,
    axis: { x: 0, y: 0 },
    digital: { left: false, right: false, up: false, down: false },
  });
  const emitAxis = useCallback(
    (x: number, y: number) => {
      const state = stateRef.current;
      const next = {
        x: Math.abs(x) < deadzone ? 0 : Math.round(x * 1000) / 1000,
        y: Math.abs(y) < deadzone ? 0 : Math.round(y * 1000) / 1000,
      };
      if (next.x !== state.axis.x || next.y !== state.axis.y) {
        state.axis = next;
        dispatchGameInput('MOVE', 'change', { axis: next, source: 'touch' });
      }
      const digital = {
        left: !analogOnly && x <= -threshold,
        right: !analogOnly && x >= threshold,
        up: !analogOnly && y <= -threshold,
        down: !analogOnly && y >= threshold,
      };
      for (const direction of directions) {
        if (digital[direction] !== state.digital[direction]) {
          dispatchGameInput(directionActions[direction], digital[direction] ? 'down' : 'up', {
            source: 'touch',
          });
        }
      }
      state.digital = digital;
    },
    [analogOnly, deadzone, threshold],
  );
  const positionKnob = useCallback((x: number, y: number) => {
    const knob = knobRef.current;
    if (knob) {
      knob.style.left = `${stateRef.current.radius + x}px`;
      knob.style.top = `${stateRef.current.radius + y}px`;
    }
  }, []);
  const release = useCallback(() => {
    stateRef.current.pointerId = null;
    positionKnob(0, 0);
    emitAxis(0, 0);
  }, [emitAxis, positionKnob]);
  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (stateRef.current.pointerId !== null || !knobRef.current) return;
      event.preventDefault();
      const state = stateRef.current;
      state.pointerId = event.pointerId;
      state.centerX = event.clientX;
      state.centerY = event.clientY;
      state.radius = Math.max(
        1,
        (event.currentTarget.getBoundingClientRect().width - knobRef.current.offsetWidth) / 2,
      );
      event.currentTarget.setPointerCapture(event.pointerId);
      positionKnob(0, 0);
      emitAxis(0, 0);
    },
    [emitAxis, positionKnob],
  );

  useEffect(() => {
    if (!enabled) return;
    const onMove = (event: PointerEvent) => {
      const state = stateRef.current;
      if (event.pointerId !== state.pointerId) return;
      event.preventDefault();
      const x = event.clientX - state.centerX;
      const y = event.clientY - state.centerY;
      const length = Math.hypot(x, y);
      const scale = length > state.radius ? state.radius / length : 1;
      positionKnob(x * scale, y * scale);
      emitAxis((x * scale) / state.radius, (y * scale) / state.radius);
    };
    const onEnd = (event: PointerEvent) => {
      if (event.pointerId === stateRef.current.pointerId) release();
    };
    const onVisibilityChange = () => {
      if (document.hidden) release();
    };
    window.addEventListener('pointermove', onMove, { passive: false });
    window.addEventListener('pointerup', onEnd);
    window.addEventListener('pointercancel', onEnd);
    window.addEventListener('blur', release);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onEnd);
      window.removeEventListener('pointercancel', onEnd);
      window.removeEventListener('blur', release);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      release();
    };
  }, [enabled, emitAxis, positionKnob, release]);

  return { baseRef, knobRef, onPointerDown, onLostPointerCapture: release };
}
