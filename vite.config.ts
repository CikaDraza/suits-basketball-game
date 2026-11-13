import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import pkg from './package.json';
import { ANIMATION_PATHS } from './src/game/assets/manifest';

function diagnosticBuild() {
  const git = (...args: string[]) => {
    try {
      return execFileSync('git', args, {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim();
    } catch {
      return 'unavailable';
    }
  };
  const digest = (path: string) => {
    try {
      return createHash('sha256').update(readFileSync(path)).digest('hex');
    } catch {
      return 'unavailable';
    }
  };
  const sourceFiles = git(
    'ls-files',
    '--cached',
    '--others',
    '--exclude-standard',
    'src',
    'vite.config.ts',
    'package.json',
    'package-lock.json',
  );
  const sourceHash = createHash('sha256');
  for (const path of sourceFiles.split('\n').filter(Boolean).sort())
    sourceHash.update(path).update('\0').update(digest(path)).update('\0');
  return {
    codeSha256AtServerStart:
      sourceFiles === 'unavailable' ? 'unavailable' : sourceHash.digest('hex'),
    version: pkg.version,
    commit: git('rev-parse', 'HEAD'),
    dirtyAtServerStart: git('status', '--porcelain') !== '',
    createdAt: new Date().toISOString(),
    engines: {
      three: pkg.dependencies.three,
      rapier: pkg.dependencies['@react-three/rapier'],
      rapierCore: JSON.parse(
        readFileSync('node_modules/@dimforge/rapier3d-compat/package.json', 'utf8'),
      ).version as string,
    },
    sha256: Object.fromEntries(
      [
        'src/game/data/game-config.json',
        'src/game/data/level-1.json',
        'public/models/shaquille_oneal.glb',
        'public/models/charles_barkley.glb',
        `public/${ANIMATION_PATHS.shaq.defense}`,
      ].map((path) => [path, digest(path)]),
    ),
  };
}
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  define:
    mode === 'development' ? { __SUITS_DIAGNOSTIC_BUILD__: JSON.stringify(diagnosticBuild()) } : {},
  base: mode === 'development' ? '/game/' : './',
  server: {
    watch: {
      ignored: ['**/playtest/**', '**/test-results/**', '**/playwright-report/**'],
    },
  },
  build: {
    assetsDir: '',
    rollupOptions: {
      output: {
        // Keep the large, stable engines cacheable when application code changes.
        manualChunks(id) {
          if (id.includes('/node_modules/@dimforge/rapier3d-compat/')) return 'physics';
          if (id.includes('/node_modules/three/')) return 'three';
        },
      },
    },
  },
}));
