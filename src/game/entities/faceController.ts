import type { Mesh, Object3D } from 'three';
import { clamp } from '../utils/math';

export interface FaceState {
  blinkLeft?: number;
  blinkRight?: number;
  jawOpen?: number;
  gazeX?: number;
  gazeY?: number;
}

const MORPHS = [
  'eyeBlinkLeft',
  'eyeBlinkRight',
  'jawOpen',
  'eyeLookLeft',
  'eyeLookRight',
  'eyeLookUp',
  'eyeLookDown',
] as const;

interface FaceTarget {
  influences: number[];
  indices: (number | undefined)[];
  eye: 'left' | 'right' | null;
}

const finiteNumber = (value: number) => Number(value) || 0;

/**
 * Typed port of Basketball_Characters/facial-controls.js.
 * Call once per independently cloned character; call the returned setter every frame.
 * Morphs: eyeBlinkLeft/Right, jawOpen, eyeLookLeft/Right/Up/Down.
 */
export function createFaceController(root: Object3D) {
  const targets: FaceTarget[] = [];
  root.traverse((object) => {
    const m = object as Mesh;
    if (!m.isMesh) return;
    m.castShadow = false;
    m.receiveShadow = false;
    const dictionary = m.morphTargetDictionary;
    if (dictionary && m.morphTargetInfluences) {
      targets.push({
        influences: m.morphTargetInfluences,
        indices: MORPHS.map((name) => dictionary[name]),
        eye: m.name.includes('EyeLeft') ? 'left' : m.name.includes('EyeRight') ? 'right' : null,
      });
    }
  });
  const values = new Array<number>(MORPHS.length).fill(0);
  return ({
    blinkLeft = 0,
    blinkRight = blinkLeft,
    jawOpen = 0,
    gazeX = 0,
    gazeY = 0,
  }: FaceState = {}) => {
    const leftBlink = clamp(finiteNumber(blinkLeft), 0, 1);
    const rightBlink = clamp(finiteNumber(blinkRight), 0, 1);
    const x = clamp(finiteNumber(gazeX), -1, 1);
    const y = clamp(finiteNumber(gazeY), -1, 1);
    values[0] = leftBlink;
    values[1] = rightBlink;
    values[2] = clamp(finiteNumber(jawOpen), 0, 1);
    values[3] = Math.max(-x, 0);
    values[4] = Math.max(x, 0);
    values[5] = Math.max(y, 0);
    values[6] = Math.max(-y, 0);
    for (const target of targets) {
      const visible =
        target.eye === 'left' ? 1 - leftBlink : target.eye === 'right' ? 1 - rightBlink : 1;
      for (let i = 0; i < target.indices.length; i++) {
        const index = target.indices[i];
        if (index !== undefined) target.influences[index] = values[i] * (i >= 3 ? visible : 1);
      }
    }
  };
}
