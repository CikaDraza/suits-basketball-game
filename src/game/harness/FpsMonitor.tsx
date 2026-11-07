import { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useHarnessStore } from '../state/harnessStore';

const UPDATE_INTERVAL_MS = 500;

export function FpsMonitor() {
  const gl = useThree((state) => state.gl);
  const frames = useRef(0);
  const elapsed = useRef(0);

  useFrame((_, delta) => {
    frames.current += 1;
    elapsed.current += delta;

    if (elapsed.current >= UPDATE_INTERVAL_MS / 1000) {
      const info = gl.info;
      useHarnessStore.getState().setPerformance({
        fps: Math.round(frames.current / elapsed.current),
        triangles: info.render.triangles,
        drawCalls: info.render.calls,
      });

      frames.current = 0;
      elapsed.current = 0;
    }
  });

  return null;
}
