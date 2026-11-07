import { useLayoutEffect, useRef } from 'react';
import type { SpotLight } from 'three';
import { config } from '../data/gameConfig';

// Court handoff lighting ("one sharp key pool over the half-court; everything else falls to black"),
// plus a soft sky/floor fill so the PBR suits and faces read.
const SPOT_POS: [number, number, number] = [-1.5, 16, -1.2];
const SPOT_TARGET: [number, number, number] = [5, 0, 0.5];
const DIR_POS: [number, number, number] = [10, 9, 6];

export function Lighting() {
  const spot = useRef<SpotLight>(null);
  useLayoutEffect(() => {
    if (!spot.current) return;
    spot.current.target.position.set(...SPOT_TARGET);
    spot.current.target.updateMatrixWorld();
  }, []);
  const r = config.rendering;
  return (
    <>
      <spotLight
        ref={spot}
        color="#fff1dc"
        intensity={r.spotIntensity}
        distance={0}
        angle={0.74}
        penumbra={0.6}
        decay={1.15}
        position={SPOT_POS}
      />
      <directionalLight color="#ffeedd" intensity={r.keyLight} position={DIR_POS} />
      <hemisphereLight args={['#dfe9f2', '#5a3b24', r.ambient]} />
    </>
  );
}
