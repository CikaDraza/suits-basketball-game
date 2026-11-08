import type { Legend } from '../data/gameConfig';

export interface AssetEntry {
  readonly id: string;
  readonly path: string;
  readonly type: 'model' | 'texture' | 'audio' | 'image';
  readonly tags?: readonly string[];
}

// Relative URLs also work when a production build is hosted below a subdirectory.
export const MODEL_PATHS: Readonly<Record<Legend, string>> = {
  shaq: 'models/shaquille_oneal.glb',
  chuck: 'models/charles_barkley.glb',
};

/** Historical inputs; gameplay loads only MODEL_PATHS. */
export const MODEL_ARCHIVES = {
  shaqOriginal: 'models/archives/shaquille_oneal.org.glb',
  shaqWalkingSource: 'models/archives/shaquille_oneal_walking_test.glb',
} as const;

export const PORTRAIT_PATHS: Readonly<Record<Legend, string>> = {
  shaq: 'images/shaq-portrait.png',
  chuck: 'images/chuck-portrait.png',
};

export const TEXTURE_PATHS = {
  basketball: 'textures/basketball.png',
} as const;

export const ASSET_MANIFEST: readonly AssetEntry[] = [
  {
    id: 'shaq-model',
    path: MODEL_PATHS.shaq,
    type: 'model',
    tags: ['character', 'rigged', 'mixamo', 'face-morphs', 'walking'],
  },
  {
    id: 'chuck-model',
    path: MODEL_PATHS.chuck,
    type: 'model',
    tags: ['character', 'rigged', 'mixamo', 'face-morphs'],
  },
  { id: 'ball', path: TEXTURE_PATHS.basketball, type: 'texture' },
  { id: 'shaq', path: PORTRAIT_PATHS.shaq, type: 'image' },
  { id: 'chuck', path: PORTRAIT_PATHS.chuck, type: 'image' },
];
