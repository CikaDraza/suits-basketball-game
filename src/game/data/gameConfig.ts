import raw from './game-config.json';
import levelRaw from './level-1.json';
const [px, , pz] = raw.camera.position;
const [tx, , tz] = raw.camera.target;

export const config = {
  ...raw,
  camera: {
    ...raw.camera,
    // Derive camera-relative controls without mutating the imported JSON module.
    inputAngle: Math.atan2(px - tx, pz - tz),
  },
};
export const level = levelRaw;
export type GameConfig = typeof config;
export type Legend = 'shaq' | 'chuck';
