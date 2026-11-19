import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import test from 'node:test';
import { Texture } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { loadCharacter } from './helpers/loadCharacter';
import { ANIMATION_PATHS } from '../src/game/assets/manifest';
import { createImportedJump } from '../src/game/entities/importedJump';
import { createSmallJump } from '../src/game/simulation/smallJump';

test('clean jump is Shaq-compatible, under one second and changes only bone quaternions in gameplay', async (context) => {
  const active = await loadCharacter('shaq');
  context.after(active.dispose);
  const loader = new GLTFLoader();
  loader.register(() => ({ name: 'CPUJump', loadTexture: async () => new Texture() }));
  const bytes = await readFile(`public/${ANIMATION_PATHS.shaq.smallJump}`);
  const source = await loader.parseAsync(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    '',
  );
  const layer = createImportedJump(active.model, source.scene, source.animations);
  assert.ok(layer.debug.duration < 1);
  const transforms = Object.values(active.bones).map((b) => [
    ...b.position.toArray(),
    ...b.scale.toArray(),
  ]);
  const jump = createSmallJump();
  jump.phase = 'airborne';
  jump.airTime = 0.19;
  for (let f = 0; f < 30; f++) {
    layer.step(1 / 60, jump, true, false);
    active.reset();
    layer.apply();
  }
  assert.ok(layer.debug.applied > 15);
  assert.deepEqual(
    Object.values(active.bones).map((b) => [...b.position.toArray(), ...b.scale.toArray()]),
    transforms,
  );
  active.reset();
  const torso = active.bones.Spine.quaternion.clone();
  const shoulder = active.bones.LeftShoulder.quaternion.clone();
  layer.step(1 / 60, jump, true, false);
  layer.apply(true);
  assert.ok(layer.debug.applied > 0);
  assert.equal(layer.debug.appliedUpper, 0);
  assert.deepEqual(active.bones.Spine.quaternion.toArray(), torso.toArray());
  assert.deepEqual(active.bones.LeftShoulder.quaternion.toArray(), shoulder.toArray());
});
