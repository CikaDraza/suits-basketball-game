import { useThree, useFrame } from '@react-three/fiber';
import { useLayoutEffect, useMemo } from 'react';
import { Vector3, type PerspectiveCamera } from 'three';
import { config } from '../data/gameConfig';
import { clamp } from '../utils/math';
import { duel } from '../entities/Duel';
import { COURT, HOOP } from '../court/constants';
import { isSimulationRunning } from '../simulation/isSimulationRunning';
import { useHarnessStore } from '../state/harnessStore';

type Safe = { top: number; right: number; bottom: number; left: number };

/**
 * Framing anchors (court coordinates):
 *  TOP    — backboard top: pinned to the top of the HUD-free area,
 *  BOTTOM — near sideline at `camera.frameLength` m from the baseline: pinned to the bottom,
 *  LEFT   — baseline corners + hoop base: pinned to the left edge.
 *  KEEP   — the whole three-point arc: zoom is capped so it always fits horizontally.
 * Beyond the arc, the far side toward half court may run off to the right.
 */
const ANCHORS = (() => {
  const { HALF_WIDTH: W, BOARD_X } = COURT,
    top = HOOP.BOARD_BOTTOM + HOOP.BOARD_H;
  const L = Math.min(COURT.LENGTH, config.camera.frameLength);
  const v = (x: number, y: number, z: number) => new Vector3(x, y, z);
  return {
    top: [v(BOARD_X, top, -HOOP.BOARD_W / 2), v(BOARD_X, top, HOOP.BOARD_W / 2)],
    bottom: [v(L, 0, W)],
    left: [v(0, 0, -W), v(0, 0, W), v(HOOP.BASE_X - 0.5, 0, 0)],
    keep: Array.from({ length: 25 }, (_, i) => {
      const a = -Math.PI / 2 + (i / 24) * Math.PI;
      const z = clamp(
        COURT.THREE_RADIUS * Math.sin(a),
        -COURT.THREE_CORNER_Z,
        COURT.THREE_CORNER_Z,
      );
      return v(COURT.BASKET_X + COURT.THREE_RADIUS * Math.cos(a), 0, z);
    }).concat([v(0, 0, -COURT.THREE_CORNER_Z), v(0, 0, COURT.THREE_CORNER_Z)]),
  };
})();

/** HUD-free screen area (px) per layout: compact phone landscape vs. tablet/desktop. */
function safeArea(h: number): Safe {
  const s = config.camera.safe;
  const m = h <= 520 ? s.phone : s.desktop;
  // desktop margins scale a little with the viewport so big screens get a bigger court
  const k = h <= 520 ? 1 : Math.min(1.25, h / 900);
  return { top: m.top * k, right: m.right * k, bottom: m.bottom * k, left: m.left * k };
}

/**
 * Static TV-broadcast rig using the court design's view direction (basket upper-left,
 * half-court line toward the bottom edge). The camera is pulled back with a long lens so the
 * court reads as a rectangle rather than a rhombus, then the FOV (zoom) and a lens shift
 * are solved per screen so the whole court + hoop exactly fill the HUD-free area.
 */
export function CameraRig() {
  const inspection = useHarnessStore((s) => s.inspectionView);
  const camera = useThree((s) => s.camera) as PerspectiveCamera;
  const width = useThree((s) => s.size.width);
  const height = useThree((s) => s.size.height);
  const basePos = useMemo(() => new Vector3(), []);
  const cam = config.camera;
  useLayoutEffect(() => {
    const W = width,
      H = height;
    if (W <= 0 || H <= 0) return;
    if (inspection) {
      camera.clearViewOffset();
      camera.fov = 35;
      camera.near = 0.05;
      camera.updateProjectionMatrix();
      return;
    }
    const [tx, ty, tz] = cam.target,
      [px, , pz] = cam.position;
    // same compass direction as the court design; height and horizontal distance are explicit
    const flat = new Vector3(px - tx, 0, pz - tz).normalize();
    camera.position.set(tx, 0, tz).addScaledVector(flat, cam.horizontalDistance).setY(cam.height);
    basePos.copy(camera.position);
    camera.lookAt(tx, ty, tz);
    camera.near = 0.5;
    camera.far = 200;
    camera.updateMatrixWorld(true);

    // project anchors into fov-independent "tan space" (x/-z, y/-z in camera space)
    const projected = new Vector3();
    const tan = (p: Vector3) => {
      projected.copy(p).applyMatrix4(camera.matrixWorldInverse);
      return [projected.x / -projected.z, projected.y / -projected.z];
    };
    const vTop = Math.max(...ANCHORS.top.map((p) => tan(p)[1]));
    const vBottom = Math.min(...ANCHORS.bottom.map((p) => tan(p)[1]));
    const uLeft = Math.min(...ANCHORS.left.map((p) => tan(p)[0]));
    const safe = safeArea(H);
    const ah = Math.max(50, H - safe.top - safe.bottom),
      aw = Math.max(50, W - safe.left - safe.right);
    const uKeep = Math.max(...ANCHORS.keep.map((p) => tan(p)[0]));
    const s = Math.min(ah / (vTop - vBottom), aw / (uKeep - uLeft)); // px per tan unit
    camera.fov = (2 * Math.atan(H / 2 / s) * 180) / Math.PI;
    // lens shift (keeps the viewing angle): top anchor → safe.top, left anchor → safe.left
    camera.setViewOffset(W, H, W / 2 + uLeft * s - safe.left, H / 2 - vTop * s - safe.top, W, H);
    camera.updateProjectionMatrix();
  }, [camera, width, height, cam, basePos, inspection]);

  useFrame((_, dt) => {
    if (inspection) {
      const p = duel.players[0],
        angle = p.angle + (inspection === 'side' ? Math.PI / 2 : 0);
      camera.position.set(p.x + Math.sin(angle) * 3.2, 1.6, p.z + Math.cos(angle) * 3.2);
      camera.lookAt(p.x, 1.15, p.z);
      camera.updateMatrixWorld();
      return;
    }
    if (!isSimulationRunning()) return;
    duel.shake *= Math.exp(-cam.shakeDecay * dt);
    camera.position.copy(basePos);
    if (duel.shake < 1e-4) {
      duel.shake = 0;
      return;
    }
    camera.position.x += Math.sin(duel.time * 83) * duel.shake;
    camera.position.y += Math.cos(duel.time * 71) * duel.shake;
  });
  return null;
}
