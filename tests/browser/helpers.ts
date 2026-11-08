import { expect, type Page } from '@playwright/test';
import type { TestSeam } from '../../src/game/harness/exposeTestSeam';

// Makes the game's existing test seam available to TypeScript inside page.evaluate.
declare global {
  interface Window {
    __TEST__?: TestSeam;
    __PAUSED__?: boolean;
  }
}

export async function bootGame(page: Page): Promise<void> {
  await page.goto('./');
  await page.waitForFunction(() => {
    const seam = window.__TEST__;
    const entities = seam?.getEntities() ?? [];
    return (
      seam?.ready === true &&
      entities.length >= 3 &&
      entities.slice(0, 3).every((entity) => {
        return (entity as { position?: unknown }).position != null;
      })
    );
  });
  await page.evaluate(() => window.__TEST__!.setDebugFlag('testMode', true));
  await page.evaluate(() => window.__TEST__!.reset(42, 'live'));
  await expect(page.locator('canvas')).toBeVisible();
}
