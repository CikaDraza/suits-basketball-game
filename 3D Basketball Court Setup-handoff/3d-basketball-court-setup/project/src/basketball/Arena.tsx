import { Suspense, type ReactNode } from 'react';
import { Canvas } from '@react-three/fiber';
import { Physics } from '@react-three/rapier';
import { Court } from './Court';
import { BasketballHoop } from './BasketballHoop';
import { Ball, CameraRig, Lighting } from './Stage';

/** Reference composition. Drop players/AI in as children. */
export function Arena({ children, debug = false }: { children?: ReactNode; debug?: boolean }) {
  return (
    <Canvas shadows={false} dpr={[1, 2]} gl={{ antialias: true, powerPreference: 'high-performance' }}>
      <CameraRig />
      <Lighting />
      <Suspense fallback={null}>
        <Physics gravity={[0, -9.81, 0]} timeStep={1 / 120} debug={debug}>
          <Court />
          <BasketballHoop />
          <Ball />
          {children}
        </Physics>
      </Suspense>
    </Canvas>
  );
}
