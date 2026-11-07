import { Suspense, type CSSProperties } from 'react';
import { Canvas, type CanvasProps } from '@react-three/fiber';
import { SceneRoot } from './scene/SceneRoot';
import { SceneErrorBoundary } from './SceneErrorBoundary';
import { useGameStore } from './state/gameStore';
import { useDebugFreeze } from './harness/useDebugFreeze';
import { config } from './data/gameConfig';

const RENDERER_OPTIONS: CanvasProps['gl'] = {
  antialias: true,
  powerPreference: 'high-performance',
};
const CAMERA_OPTIONS: CanvasProps['camera'] = {
  position: config.camera.position as [number, number, number],
  fov: config.camera.fov,
  near: 0.1,
  far: 200,
};
const CANVAS_STYLE: CSSProperties = { position: 'absolute', inset: 0 };

export function GameCanvas() {
  const playing = useGameStore((state) => state.screen === 'playing');
  const frozen = useDebugFreeze();

  return (
    <SceneErrorBoundary>
      <Canvas
        frameloop={playing && !frozen ? 'always' : 'demand'}
        shadows={false}
        dpr={config.rendering.dpr as [number, number]}
        gl={RENDERER_OPTIONS}
        camera={CAMERA_OPTIONS}
        style={CANVAS_STYLE}
      >
        <Suspense fallback={null}>
          <SceneRoot frozen={frozen} />
        </Suspense>
      </Canvas>
    </SceneErrorBoundary>
  );
}
