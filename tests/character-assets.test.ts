import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';
import { MODEL_ARCHIVES, MODEL_PATHS } from '../src/game/assets/manifest';

test('active Shaq is the approved walking export and both original input files remain archived', async () => {
  const hash = async (path: string) =>
    createHash('sha256')
      .update(await readFile(new URL(`../public/${path}`, import.meta.url)))
      .digest('hex');
  assert.equal(
    await hash(MODEL_PATHS.shaq),
    '9ddf028f4b4f2e7074c715ee08a8d8f3ec5fdf6e2159b4c35cc3dc4b49eda5d9',
  );
  assert.equal(await hash(MODEL_ARCHIVES.shaqWalkingSource), await hash(MODEL_PATHS.shaq));
  assert.equal(
    await hash(MODEL_ARCHIVES.shaqOriginal),
    '2501bf68c682e1f412df660aa239efec0865eedc3f9c042cc44ebcd9c850750b',
  );
  const entries = await readdir(new URL('../public/models/', import.meta.url));
  assert.deepEqual(entries.filter((file) => file.endsWith('.glb')).sort(), [
    'charles_barkley.glb',
    'shaquille_oneal.glb',
  ]);
});
