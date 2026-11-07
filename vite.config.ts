import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => ({
  plugins: [react()],
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
