import { useEffect, useMemo } from 'react';
import { useThree } from '@react-three/fiber';
import { RigidBody, CuboidCollider } from '@react-three/rapier';
import { COLORS } from './constants';
import {
  buildCourtLineGeometry,
  buildFloorGeometry,
  createFloorMaterial,
  createWoodTexture,
  FLOOR,
} from './courtGeometry';
import { config, level } from '../data/gameConfig';

/** Half-court maple floor + all markings (one draw call), plus the game's floor collider. */
export function Court() {
  const maxAniso = useThree((s) => s.gl.capabilities.getMaxAnisotropy());
  const wood = useMemo(() => {
    const texture = createWoodTexture(Math.min(8, maxAniso));
    texture.repeat.set((FLOOR.x1 - FLOOR.x0) / 8, (FLOOR.z * 2) / 8);
    return texture;
  }, [maxAniso]);
  const lines = useMemo(() => buildCourtLineGeometry(), []);
  const floor = useMemo(buildFloorGeometry, []);
  const floorMat = useMemo(() => createFloorMaterial(wood), [wood]);
  useEffect(() => () => floorMat.dispose(), [floorMat]);
  useEffect(
    () => () => {
      wood.dispose();
      lines.dispose();
      floor.dispose();
    },
    [wood, lines, floor],
  );

  return (
    <>
      <group name="Court">
        <mesh
          name="floor"
          geometry={floor}
          material={floorMat}
          rotation-x={-Math.PI / 2}
          position={[FLOOR.cx, 0, 0]}
        />
        <mesh name="court_lines" geometry={lines} position-y={0.002}>
          <meshStandardMaterial
            name="line_paint"
            color={COLORS.line}
            roughness={0.85}
            metalness={0}
            polygonOffset
            polygonOffsetFactor={-2}
            polygonOffsetUnits={-2}
          />
        </mesh>
      </group>
      <RigidBody type="fixed" colliders={false} userData={{ kind: 'floor' }}>
        <CuboidCollider
          args={level.floor.halfExtents as [number, number, number]}
          position={level.floor.position as [number, number, number]}
          friction={config.physics.floorFriction}
        />
      </RigidBody>
    </>
  );
}
