import * as THREE from 'three';
import { COURT } from './constants';

type Pt = [number, number]; // [x, z]
interface Path { pts: Pt[]; w: number }

const arc = (cx: number, cz: number, r: number, a0: number, a1: number, n = 64): Pt[] =>
  Array.from({ length: n + 1 }, (_, i) => {
    const a = a0 + ((a1 - a0) * i) / n;
    return [cx + r * Math.cos(a), cz + r * Math.sin(a)] as Pt;
  });

export function courtLinePaths(): Path[] {
  const { LENGTH: L, HALF_WIDTH: HW, KEY_HALF_WIDTH: K, KEY_DEPTH: D, FT_RADIUS: FR,
    BASKET_X: B, THREE_RADIUS: TR, THREE_CORNER_Z: TC, RESTRICTED_RADIUS: RA, BOARD_X } = COURT;
  const P: Path[] = [];
  const add = (pts: Pt[], w: number = COURT.LINE) => P.push({ pts, w });

  // boundary (all four act as out-of-bounds lines)
  add([[0, -HW], [0, HW]]);
  add([[0, HW], [L, HW]]);
  add([[0, -HW], [L, -HW]]);
  add([[L, -HW], [L, HW]]);
  add(arc(L, 0, FR, Math.PI / 2, Math.PI * 1.5)); // center circle, our half
  // key + free-throw circle (solid outside, dashed inside)
  add([[0, -K], [D, -K], [D, K], [0, K]]);
  add(arc(D, 0, FR, -Math.PI / 2, Math.PI / 2));
  for (let i = 0; i < 9; i++) {
    const a0 = Math.PI / 2 + ((i + 0.25) * Math.PI) / 9;
    add(arc(D, 0, FR, a0, a0 + Math.PI / 18, 6));
  }
  // three-point line
  const ta = Math.asin(TC / TR), tx = B + Math.sqrt(TR ** 2 - TC ** 2);
  add([[0, TC], [tx, TC]]);
  add([[0, -TC], [tx, -TC]]);
  add(arc(B, 0, TR, -ta, ta, 128));
  // restricted area
  add([[BOARD_X, RA], [B, RA]]);
  add([[BOARD_X, -RA], [B, -RA]]);
  add(arc(B, 0, RA, -Math.PI / 2, Math.PI / 2, 40));
  // lane block + hash marks
  for (const s of [1, -1]) {
    add([[1.95, s * (K + 0.025)], [1.95, s * (K + 0.125)]], 0.3);
    for (const x of [2.95, 3.8, 4.65]) add([[x, s * (K + 0.025)], [x, s * (K + 0.125)]], 0.05);
  }
  return P;
}

/** All markings as ONE flat strip mesh — a single draw call, crisp at any resolution. */
export function buildCourtLineGeometry(paths = courtLinePaths()): THREE.BufferGeometry {
  const pos: number[] = [], idx: number[] = [];
  for (const { pts, w } of paths) {
    for (let i = 0; i < pts.length - 1; i++) {
      const [x0, z0] = pts[i], [x1, z1] = pts[i + 1];
      let dx = x1 - x0, dz = z1 - z0;
      const l = Math.hypot(dx, dz);
      if (l < 1e-6) continue;
      dx /= l; dz /= l;
      const e = Math.min(COURT.LINE / 2, l), h = w / 2, nx = -dz * h, nz = dx * h;
      const ax = x0 - dx * e, az = z0 - dz * e, bx = x1 + dx * e, bz = z1 + dz * e;
      const b = pos.length / 3;
      pos.push(ax + nx, 0, az + nz, ax - nx, 0, az - nz, bx - nx, 0, bz - nz, bx + nx, 0, bz + nz);
      idx.push(b, b + 2, b + 1, b, b + 3, b + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const n = new Float32Array(pos.length);
  for (let i = 1; i < n.length; i += 3) n[i] = 1;
  g.setAttribute('normal', new THREE.BufferAttribute(n, 3));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

/** Procedural maple planks (8 m tile). Planks run parallel to the baseline. */
export function createWoodTexture(maxAnisotropy = 8): THREE.CanvasTexture {
  const S = 2048, cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d')!;
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  g.fillStyle = '#6a4c30';
  g.fillRect(0, 0, S, S);
  const colW = 32;
  for (let cx = 0; cx < S; cx += colW) {
    let y = -rnd() * 400;
    while (y < S) {
      const len = 220 + rnd() * 380;
      g.fillStyle = `hsl(${26 + rnd() * 8} ${38 + rnd() * 14}% ${30 + rnd() * 13}%)`;
      g.fillRect(cx, y, colW, len);
      for (let k = 0; k < 7; k++) {
        g.strokeStyle = `rgba(${rnd() < 0.5 ? '40,24,12' : '190,150,110'},${0.05 + rnd() * 0.08})`;
        g.lineWidth = 1 + rnd() * 1.5;
        const gx = cx + 3 + rnd() * (colW - 6);
        g.beginPath();
        g.moveTo(gx, y);
        g.bezierCurveTo(gx + rnd() * 4 - 2, y + len * 0.33, gx + rnd() * 4 - 2, y + len * 0.66, gx + rnd() * 3 - 1.5, y + len);
        g.stroke();
      }
      g.fillStyle = 'rgba(25,14,6,.55)';
      g.fillRect(cx, y + len - 1, colW, 1.5);
      y += len;
    }
    g.fillStyle = 'rgba(25,14,6,.5)';
    g.fillRect(cx, 0, 1.2, S);
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(COURT.FLOOR_SIZE / 8, COURT.FLOOR_SIZE / 8);
  t.anisotropy = maxAnisotropy;
  t.name = 'maple_planks';
  return t;
}

/** Soft radial blob used as a baked contact shadow (shadow maps are off). */
export function createShadowTexture(): THREE.CanvasTexture {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 256;
  const g = cv.getContext('2d')!, gr = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  gr.addColorStop(0, 'rgba(0,0,0,.72)');
  gr.addColorStop(0.45, 'rgba(0,0,0,.42)');
  gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 256, 256);
  return new THREE.CanvasTexture(cv);
}
