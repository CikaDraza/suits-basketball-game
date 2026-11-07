import { useMemo, useRef, type RefObject } from 'react';
import * as THREE from 'three';
import { createPortal, useFrame, useThree } from '@react-three/fiber';
import { BALL, COLORS } from './constants';
import { useGameStore } from './gameStore';

// Diamond-mesh net: 12 strands × 6 rings, top ring pinned to the rim.
const NS = 12, NR = 6;
const RING_R = [0.228, 0.207, 0.184, 0.166, 0.154, 0.148];
const RING_Y = [0, -0.085, -0.175, -0.265, -0.355, -0.44];
const STEP = 1 / 120, ITER = 6, DAMP = 0.982, SHAPE = 0.035, GRAVITY = -9.81;
const HIT_R = BALL.RADIUS + 0.012;
const BALL_DRAG = 0.0025; // fraction of ball momentum lost per touching node per step

function buildNet() {
  const rest = new Float32Array(NS * NR * 3);
  for (let r = 0; r < NR; r++) for (let i = 0; i < NS; i++) {
    const a = ((i + (r % 2) * 0.5) / NS) * Math.PI * 2, k = (r * NS + i) * 3;
    rest[k] = Math.cos(a) * RING_R[r]; rest[k + 1] = RING_Y[r]; rest[k + 2] = Math.sin(a) * RING_R[r];
  }
  const id = (r: number, i: number) => r * NS + (((i % NS) + NS) % NS);
  const links: number[] = [];
  for (let r = 0; r < NR - 1; r++) for (let i = 0; i < NS; i++) {
    links.push(id(r, i), id(r + 1, i), id(r, i), id(r + 1, r % 2 ? i + 1 : i - 1));
  }
  for (let i = 0; i < NS; i++) links.push(id(NR - 1, i), id(NR - 1, i + 1));
  const L = new Uint16Array(links);
  const restLen = new Float32Array(L.length / 2);
  for (let l = 0; l < restLen.length; l++) {
    const a = L[l * 2] * 3, b = L[l * 2 + 1] * 3;
    restLen[l] = Math.hypot(rest[b] - rest[a], rest[b + 1] - rest[a + 1], rest[b + 2] - rest[a + 2]);
  }
  return { rest, links: L, restLen, P: new Float32Array(rest.length), Pp: new Float32Array(rest.length), ready: false, acc: 0 };
}

/**
 * Verlet chain-link net. Simulated in world space (portaled to the scene root) so it
 * inherits inertia from rim/arm motion; the ball pushes nodes out of its volume,
 * which produces the expansion, ripple and sway — scaled naturally by entry speed,
 * angle and offset. The net returns a small drag impulse to the ball.
 */
export function Net({ anchor }: { anchor: RefObject<THREE.Object3D> }) {
  const scene = useThree((s) => s.scene);
  const sim = useMemo(buildNet, []);
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(sim.links.length * 3), 3));
    return g;
  }, [sim]);
  const t = useRef({ v: new THREE.Vector3(), m: new THREE.Matrix4(), c: new THREE.Vector3() }).current;

  useFrame((_, delta) => {
    const a = anchor.current;
    if (!a) return;
    a.updateWorldMatrix(true, false);
    const e = a.matrixWorld.elements, { rest, P, Pp, links, restLen } = sim;
    const xf = (k: number, out: Float32Array, o: number) => {
      const x = rest[k], y = rest[k + 1], z = rest[k + 2];
      out[o] = e[0] * x + e[4] * y + e[8] * z + e[12];
      out[o + 1] = e[1] * x + e[5] * y + e[9] * z + e[13];
      out[o + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
    };
    if (!sim.ready) { for (let k = 0; k < P.length; k += 3) { xf(k, P, k); xf(k, Pp, k); } sim.ready = true; }

    const ball = useGameStore.getState().ballBody;
    const bp = ball?.translation(), bv = ball?.linvel();
    a.getWorldPosition(t.c);
    const near = !!bp && Math.hypot(bp.x - t.c.x, bp.y - t.c.y, bp.z - t.c.z) < 0.9;
    const target = new Float32Array(3);

    sim.acc += Math.min(delta, 1 / 20);
    let touches = 0;
    while (sim.acc >= STEP) {
      sim.acc -= STEP;
      for (let k = 0; k < P.length; k += 3) {
        xf(k, target, 0);
        if (k < NS * 3) { P[k] = Pp[k] = target[0]; P[k + 1] = Pp[k + 1] = target[1]; P[k + 2] = Pp[k + 2] = target[2]; continue; }
        for (let j = 0; j < 3; j++) {
          const vel = (P[k + j] - Pp[k + j]) * DAMP;
          Pp[k + j] = P[k + j];
          P[k + j] += vel + (j === 1 ? GRAVITY * STEP * STEP : 0);
          P[k + j] += (target[j] - P[k + j]) * SHAPE;
        }
        if (near) {
          const dx = P[k] - bp!.x, dy = P[k + 1] - bp!.y, dz = P[k + 2] - bp!.z, d = Math.hypot(dx, dy, dz);
          if (d < HIT_R && d > 1e-6) {
            const s = HIT_R / d;
            P[k] = bp!.x + dx * s + bv!.x * STEP * 0.45;
            P[k + 1] = bp!.y + dy * s + bv!.y * STEP * 0.45;
            P[k + 2] = bp!.z + dz * s + bv!.z * STEP * 0.45;
            touches++;
          }
        }
      }
      for (let it = 0; it < ITER; it++) {
        for (let l = 0; l < restLen.length; l++) {
          const ia = links[l * 2] * 3, ib = links[l * 2 + 1] * 3;
          const dx = P[ib] - P[ia], dy = P[ib + 1] - P[ia + 1], dz = P[ib + 2] - P[ia + 2];
          const d = Math.hypot(dx, dy, dz);
          if (d < 1e-6) continue;
          const f = (d - restLen[l]) / d, pinned = ia < NS * 3;
          const wa = pinned ? 0 : 0.5, wb = pinned ? 1 : 0.5;
          P[ia] += dx * f * wa; P[ia + 1] += dy * f * wa; P[ia + 2] += dz * f * wa;
          P[ib] -= dx * f * wb; P[ib + 1] -= dy * f * wb; P[ib + 2] -= dz * f * wb;
        }
      }
    }
    if (touches && ball && bv) {
      const k = -BALL.MASS * BALL_DRAG * Math.min(touches, 40);
      ball.applyImpulse({ x: bv.x * k, y: bv.y * k, z: bv.z * k }, true);
    }

    const out = geo.attributes.position.array as Float32Array;
    for (let l = 0; l < links.length; l++) {
      const s = links[l] * 3;
      out[l * 3] = P[s]; out[l * 3 + 1] = P[s + 1]; out[l * 3 + 2] = P[s + 2];
    }
    geo.attributes.position.needsUpdate = true;
  });

  return createPortal(
    <lineSegments name="net" geometry={geo} frustumCulled={false}>
      <lineBasicMaterial name="net_cord" color={COLORS.net} />
    </lineSegments>,
    scene,
  );
}
