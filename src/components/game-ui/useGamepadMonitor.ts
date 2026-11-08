import { useEffect, useRef, useState } from 'react';

export interface PadMonitorSnapshot {
  index: number;
  id: string;
  mapping: GamepadMappingType;
  axes: number[];
  buttons: { value: number; pressed: boolean }[];
}

/** A low-frequency readout while settings are open; gameplay keeps its own fixed-step reads. */
export function useGamepadMonitor() {
  const [pads, setPads] = useState<PadMonitorSnapshot[]>([]);
  const last = useRef('');
  useEffect(() => {
    const poll = () => {
      const next: PadMonitorSnapshot[] = [];
      for (const pad of navigator.getGamepads?.() ?? [])
        if (pad?.connected)
          next.push({
            index: pad.index,
            id: pad.id,
            mapping: pad.mapping,
            axes: pad.axes.map((value) => Math.round(value * 100) / 100),
            buttons: pad.buttons.map((button) => ({
              value: Math.round(button.value * 100) / 100,
              pressed: button.pressed,
            })),
          });
      const signature = JSON.stringify(next);
      if (signature !== last.current) {
        last.current = signature;
        setPads(next);
      }
    };
    const timer = window.setInterval(poll, 100);
    window.addEventListener('gamepadconnected', poll);
    window.addEventListener('gamepaddisconnected', poll);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('gamepadconnected', poll);
      window.removeEventListener('gamepaddisconnected', poll);
    };
  }, []);
  return pads;
}
