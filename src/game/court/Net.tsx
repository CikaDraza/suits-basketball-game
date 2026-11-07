import { useEffect, useMemo, type RefObject } from 'react';
import * as THREE from 'three';
import { createPortal, useFrame, useThree } from '@react-three/fiber';
import { COLORS } from './constants';
import { bodies, duel } from '../entities/Duel';
import { config } from '../data/gameConfig';
import { isSimulationRunning } from '../simulation/isSimulationRunning';

// Diamond-mesh net: 12 strands × 6 rings, top ring pinned to the rim.
const NS = 12,
  NR = 6;
const RING_R = [0.228, 0.207, 0.184, 0.166, 0.154, 0.148];
const RING_Y = [0, -0.085, -0.175, -0.265, -0.355, -0.44];
const STEP = 1 / 120,
  ITER = 6,
  DAMP = 0.982,
  SHAPE = 0.035,
  GRAVITY = -9.81;
const HIT_R = config.ball.radius + 0.012;
const BALL_DRAG = 0.0025; // fraction of ball momentum lost per touching node per step

function buildNet() {
  const rest = new Float32Array(NS * NR * 3);
  for (let r = 0; r < NR; r++)
    for (let i = 0; i < NS; i++) {
      const a = ((i + (r % 2) * 0.5) / NS) * Math.PI * 2,
        k = (r * NS + i) * 3;
      rest[k] = Math.cos(a) * RING_R[r];
      rest[k + 1] = RING_Y[r];
      rest[k + 2] = Math.sin(a) * RING_R[r];
    }
  const id = (r: number, i: number) => r * NS + (((i % NS) + NS) % NS);
  const links: number[] = [];
  for (let r = 0; r < NR - 1; r++)
    for (let i = 0; i < NS; i++) {
      links.push(id(r, i), id(r + 1, i), id(r, i), id(r + 1, r % 2 ? i + 1 : i - 1));
    }
  for (let i = 0; i < NS; i++) links.push(id(NR - 1, i), id(NR - 1, i + 1));
  const L = new Uint16Array(links);
  const restLen = new Float32Array(L.length / 2);
  for (let l = 0; l < restLen.length; l++) {
    const a = L[l * 2] * 3,
      b = L[l * 2 + 1] * 3;
    restLen[l] = Math.hypot(
      rest[b] - rest[a],
      rest[b + 1] - rest[a + 1],
      rest[b + 2] - rest[a + 2],
    );
  }
  return {
    rest,
    links: L,
    restLen,
    P: new Float32Array(rest.length),
    Pp: new Float32Array(rest.length),
    ready: false,
    acc: 0,
  };
}

function transformRestPoint(
  rest: Float32Array,
  matrix: number[],
  source: number,
  output: Float32Array,
  offset: number,
) {
  const x = rest[source],
    y = rest[source + 1],
    z = rest[source + 2];
  output[offset] = matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12];
  output[offset + 1] = matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13];
  output[offset + 2] = matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14];
}

interface NetProps {
  readonly anchor: RefObject<THREE.Object3D | null>;
}

/**
 * Verlet chain-link net, simulated in world space (portaled to the scene root) so it
 * inherits inertia from rim/arm motion. The ball pushes nodes out of its volume
 * (expansion, ripple, sway) and the net returns a small drag impulse to a free ball.
 */
export function Net({ anchor }: NetProps) {
  const scene = useThree((s) => s.scene);
  const sim = useMemo(buildNet, []);
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array(sim.links.length * 3), 3).setUsage(
        THREE.DynamicDrawUsage,
      ),
    );
    return g;
  }, [sim]);
  useEffect(() => () => geo.dispose(), [geo]);
  const t = useMemo(() => ({ c: new THREE.Vector3(), target: new Float32Array(3) }), []);

  useFrame((_, delta) => {
    if (!isSimulationRunning()) return;
    const a = anchor.current;
    if (!a) return;
    a.updateWorldMatrix(true, false);
    const e = a.matrixWorld.elements,
      { rest, P, Pp, links, restLen } = sim;
    if (!sim.ready) {
      for (let k = 0; k < P.length; k += 3) {
        transformRestPoint(rest, e, k, P, k);
        transformRestPoint(rest, e, k, Pp, k);
      }
      sim.ready = true;
    }

    const ball = bodies.ball;
    const bp = ball?.translation(),
      bv = ball?.linvel();
    a.getWorldPosition(t.c);
    const near = !!bp && Math.hypot(bp.x - t.c.x, bp.y - t.c.y, bp.z - t.c.z) < 0.9;
    const target = t.target;

    sim.acc += Math.min(delta, 1 / 20);
    let touches = 0;
    while (sim.acc >= STEP) {
      sim.acc -= STEP;
      for (let k = 0; k < P.length; k += 3) {
        transformRestPoint(rest, e, k, target, 0);
        if (k < NS * 3) {
          P[k] = Pp[k] = target[0];
          P[k + 1] = Pp[k + 1] = target[1];
          P[k + 2] = Pp[k + 2] = target[2];
          continue;
        }
        for (let j = 0; j < 3; j++) {
          const vel = (P[k + j] - Pp[k + j]) * DAMP;
          Pp[k + j] = P[k + j];
          P[k + j] += vel + (j === 1 ? GRAVITY * STEP * STEP : 0);
          P[k + j] += (target[j] - P[k + j]) * SHAPE;
        }
        if (near) {
          const dx = P[k] - bp!.x,
            dy = P[k + 1] - bp!.y,
            dz = P[k + 2] - bp!.z,
            d = Math.hypot(dx, dy, dz);
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
          const ia = links[l * 2] * 3,
            ib = links[l * 2 + 1] * 3;
          const dx = P[ib] - P[ia],
            dy = P[ib + 1] - P[ia + 1],
            dz = P[ib + 2] - P[ia + 2];
          const d = Math.hypot(dx, dy, dz);
          if (d < 1e-6) continue;
          const f = (d - restLen[l]) / d,
            pinned = ia < NS * 3;
          const wa = pinned ? 0 : 0.5,
            wb = pinned ? 1 : 0.5;
          P[ia] += dx * f * wa;
          P[ia + 1] += dy * f * wa;
          P[ia + 2] += dz * f * wa;
          P[ib] -= dx * f * wb;
          P[ib + 1] -= dy * f * wb;
          P[ib + 2] -= dz * f * wb;
        }
      }
    }
    // only a free (physics-driven) ball feels the net's drag
    if (touches && ball && bv && (duel.ballState === 'loose' || duel.ballState === 'scored')) {
      const k = -ball.mass() * BALL_DRAG * Math.min(touches, 40);
      ball.applyImpulse({ x: bv.x * k, y: bv.y * k, z: bv.z * k }, true);
    }

    const out = geo.attributes.position.array as Float32Array;
    for (let l = 0; l < links.length; l++) {
      const s = links[l] * 3;
      out[l * 3] = P[s];
      out[l * 3 + 1] = P[s + 1];
      out[l * 3 + 2] = P[s + 2];
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
