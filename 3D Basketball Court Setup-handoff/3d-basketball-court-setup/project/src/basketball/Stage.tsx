import { useLayoutEffect, useRef } from 'react';
import * as THREE from 'three';
import { useThree } from '@react-three/fiber';
import { RigidBody, type RapierRigidBody } from '@react-three/rapier';
import { BALL, CAMERA } from './constants';
import { useGameStore, type BodyTag } from './gameStore';

/** 100% static isometric rig — full half-court in frame, hoop on the left. */
export function CameraRig() {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const aspect = useThree((s) => s.size.width / s.size.height);
  useLayoutEffect(() => {
    const t = Math.tan((CAMERA.fov * Math.PI) / 360) * Math.max(1, CAMERA.refAspect / aspect);
    camera.fov = (2 * Math.atan(t) * 180) / Math.PI;
    camera.near = 0.1;
    camera.far = 200;
    camera.position.set(...CAMERA.position);
    camera.lookAt(...CAMERA.target);
    camera.updateProjectionMatrix();
  }, [camera, aspect]);
  return null;
}

/** One sharp key pool over the half-court; everything else falls to black. */
export function Lighting() {
  const spot = useRef<THREE.SpotLight>(null!);
  useLayoutEffect(() => {
    spot.current.target.position.set(5, 0, 0.5);
    spot.current.target.updateMatrixWorld();
  }, []);
  return (
    <>
      <color attach="background" args={['#000000']} />
      <fog attach="fog" args={['#000000', 30, 56]} />
      <spotLight ref={spot} color="#fff1dc" intensity={260} distance={0} angle={0.74} penumbra={0.6} decay={1.15} position={[-1.5, 16, -1.2]} />
      <directionalLight color="#ffeedd" intensity={1.6} position={[10, 9, 6]} />
      <ambientLight intensity={0.04} />
    </>
  );
}

export function Ball({ position = [6, 2, 1] as [number, number, number] }) {
  const ref = useRef<RapierRigidBody>(null);
  const register = useGameStore((s) => s.registerBall);
  useLayoutEffect(() => { register(ref.current); return () => register(null); }, [register]);
  return (
    <RigidBody ref={ref} position={position} colliders="ball" ccd mass={BALL.MASS} restitution={0.78} friction={0.6}
      linearDamping={0.05} angularDamping={0.2} userData={{ kind: 'ball' } satisfies BodyTag}>
      <mesh name="ball">
        <sphereGeometry args={[BALL.RADIUS, 32, 20]} />
        <meshStandardMaterial name="ball_leather" color="#c25a22" roughness={0.85} metalness={0} />
      </mesh>
    </RigidBody>
  );
}
