import { defineConfig } from '@playwright/test';
import base from './playwright.config';
const externalBaseURL = process.env.PLAYWRIGHT_BASE_URL;

/** Separate from the gameplay suite: this HTML entry exists only on the dev server. */
export default defineConfig(base, {
  testDir: './tests/animation-preview-browser',
  outputDir: 'playtest/animated-glb-preview',
  use: {
    ...base.use,
    baseURL: externalBaseURL ?? 'http://127.0.0.1:5181/game/',
    viewport: { width: 1440, height: 900 },
  },
  webServer: externalBaseURL
    ? undefined
    : {
        command: 'npm run dev -- --host 127.0.0.1 --port 5181 --strictPort',
        url: 'http://127.0.0.1:5181/game/dev/animation-preview.html',
        reuseExistingServer: !process.env.CI,
      },
});
