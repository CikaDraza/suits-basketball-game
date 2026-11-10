import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Group, Vector3 } from 'three';
import { config } from '../data/gameConfig';
import { useHarnessStore } from '../state/harnessStore';
import { bodies } from './Duel';
import type { createArmContact } from './armContact';
type Arm = ReturnType<typeof createArmContact>;
const COLORS = ['#ff4455', '#44ff77', '#3388ff'];
export function HandContactDebug({ arms }: { readonly arms: readonly Arm[] }) {
  const enabled = useHarnessStore((s) => s.debugHands);
  const group = useRef<Group>(null);
  const p = useMemo(() => new Vector3(), []);
  useFrame(() => {
    if (!enabled || !group.current) return;
    const root = group.current;
    root.updateWorldMatrix(true, false);
    arms.forEach((arm, i) => {
      for (let j = 0; j < 3; j++) {
        if (j === 0) arm.hand.getWorldPosition(p);
        else if (j === 1) arm.socket.getWorldPosition(p);
        else p.copy(arm.debug.target);
        // Debug meshes are under a character parent; the targets are world-space.
        root.worldToLocal(p);
        root.children[i * 3 + j].position.copy(p);
        root.children[i * 3 + j].visible = j !== 2 || arm.debug.weight > 0.01;
      }
    });
    root.children[6].visible = !!bodies.ballMesh;
    if (bodies.ballMesh) {
      bodies.ballMesh.getWorldPosition(p);
      root.worldToLocal(p);
      root.children[6].position.copy(p);
    }
  }, -40);
  if (!enabled) return null;
  return (
    <group ref={group}>
      {arms.flatMap((_, i) =>
        COLORS.map((color, j) => (
          <mesh key={`${i}-${j}`}>
            <sphereGeometry args={[0.014, 8, 6]} />
            <meshBasicMaterial color={color} depthTest={false} />
          </mesh>
        )),
      )}
      <mesh>
        <sphereGeometry args={[config.ball.radius, 16, 12]} />
        <meshBasicMaterial wireframe color="white" depthTest={false} />
      </mesh>
    </group>
  );
}
