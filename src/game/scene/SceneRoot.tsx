import { Physics } from '@react-three/rapier';
import { Lighting } from './Lighting';
import { CameraRig } from './CameraRig';
import { Environment } from './Environment';
import { Court, BasketballHoop } from '../court';
import { DuelArena } from '../entities/DuelArena';
import { FpsMonitor } from '../harness/FpsMonitor';
import { useHarnessStore } from '../state/harnessStore';
import { useGameStore } from '../state/gameStore';
import { config } from '../data/gameConfig';

interface SceneRootProps {
  readonly frozen?: boolean;
}

export function SceneRoot({ frozen = false }: SceneRootProps) {
  const debug = useHarnessStore((state) => state.debugColliders);
  const paused = useGameStore((state) => state.screen !== 'playing');

  return (
    <>
      <FpsMonitor />
      <Lighting />
      <CameraRig />
      <Environment />
      <Physics
        gravity={config.physics.gravity as [number, number, number]}
        timeStep={1 / config.physics.timestep}
        debug={debug}
        paused={paused || frozen}
      >
        <Court />
        <BasketballHoop />
        <DuelArena />
      </Physics>
    </>
  );
}
