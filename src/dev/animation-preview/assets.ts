import type { Object3D } from 'three';
import { MODEL_ARCHIVES } from '../../game/assets/manifest';

/** This manifest belongs to the dev entry only; gameplay assets are unchanged. */
const base = import.meta.env?.BASE_URL ?? '/';
export const previewAssets = {
  original: `${base}${MODEL_ARCHIVES.shaqOriginal}`,
  animated: `${base}${MODEL_ARCHIVES.shaqWalkingSource}`,
} as const;

export function characterRoot(scene: Object3D): Object3D {
  const root = scene.getObjectByName('shaquille_oneal_Meters');
  if (!root) throw new Error('Expected Shaq export root shaquille_oneal_Meters is missing.');
  return root;
}

export function descendants(root: Object3D): Set<Object3D> {
  const nodes = new Set<Object3D>();
  root.traverse((node) => nodes.add(node));
  return nodes;
}
