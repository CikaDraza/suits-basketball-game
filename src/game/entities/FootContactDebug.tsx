import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { Group, Mesh } from 'three';
import { useHarnessStore } from '../state/harnessStore';
import { locomotionDebug } from './locomotionDebug';

/**
 * Optional world-space view of the gait (`setDebugFlag('footContacts', true)`):
 *   green disc  — planted foot (ground contact, should not move while planted)
 *   yellow ball — swinging foot's ankle target
 *   blue ring   — neutral ankle spot under the body for the current posture
 * Combine with `setDebugFlag('colliders', true)` to see the Rapier capsules.
 */
export function FootContactDebug() {
  const enabled = useHarnessStore((s) => s.debugFeet);
  const root = useRef<Group>(null);
  useFrame(() => {
    if (!enabled || !root.current) return;
    for (let slot = 0; slot < 2; slot++) {
      const snapshot = locomotionDebug[slot];
      for (let i = 0; i < 2; i++) {
        const base = (slot * 2 + i) * 3;
        const contact = root.current.children[base] as Mesh,
          swing = root.current.children[base + 1] as Mesh,
          neutral = root.current.children[base + 2] as Mesh;
        const foot = snapshot?.feet[i];
        const show = !!foot && !!snapshot?.grounded;
        contact.visible = show && foot!.planted;
        swing.visible = show && !foot!.planted;
        neutral.visible = show;
        if (!foot) continue;
        contact.position.set(foot.target.x, 0.006, foot.target.z);
        swing.position.set(foot.target.x, foot.target.y, foot.target.z);
        neutral.position.set(foot.neutral.x, 0.008, foot.neutral.z);
      }
    }
  });
  if (!enabled) return null;
  return (
    <group ref={root}>
      {Array.from({ length: 4 }, (_, k) => [
        <mesh key={`c${k}`} rotation-x={-Math.PI / 2}>
          <circleGeometry args={[0.07, 20]} />
          <meshBasicMaterial color="#3dff7a" depthTest={false} transparent opacity={0.85} />
        </mesh>,
        <mesh key={`s${k}`}>
          <sphereGeometry args={[0.035, 10, 8]} />
          <meshBasicMaterial color="#ffd23d" depthTest={false} />
        </mesh>,
        <mesh key={`n${k}`} rotation-x={-Math.PI / 2}>
          <ringGeometry args={[0.05, 0.065, 20]} />
          <meshBasicMaterial color="#3d8bff" depthTest={false} transparent opacity={0.9} />
        </mesh>,
      ]).flat()}
    </group>
  );
}
