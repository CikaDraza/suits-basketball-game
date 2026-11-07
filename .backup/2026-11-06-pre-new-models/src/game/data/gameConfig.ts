import raw from '../../../public/data/game-config.json';
import levelRaw from '../../../public/data/levels/level-1.json';
export const config = raw;
export const level = levelRaw;
export type GameConfig = typeof config;
export type Legend = 'shaq' | 'chuck';
