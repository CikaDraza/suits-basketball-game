import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import test from 'node:test';
import { Texture } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { Bone, Mesh } from 'three';
import { inspectComparison } from '../src/dev/animation-preview/assetInspection';
import { createImportedWalk, isolateWalkingCharacter } from '../src/game/entities/importedWalk';
import { MODEL_PATHS, MODEL_ARCHIVES } from '../src/game/assets/manifest';

test('walking export preserves Shaq hierarchy and binds its retarget clip; all four limbs move independently of root motion', async (context) => {
  const loader = new GLTFLoader();
  const textures: Texture[] = [];
  loader.register(() => ({
    name: 'CPUPreviewTextures',
    loadTexture: async () => {
      const texture = new Texture();
      textures.push(texture);
      return texture;
    },
  }));
  context.after(() => textures.forEach((texture) => texture.dispose()));
  const load = async (name: string) => {
    const bytes = await readFile(new URL(`../public/${name}`, import.meta.url));
    return loader.parseAsync(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
      '',
    );
  };
  const [original, animated] = await Promise.all([
    load(MODEL_ARCHIVES.shaqOriginal),
    load(MODEL_PATHS.shaq),
  ]);
  const report = inspectComparison(original, animated);
  assert.equal(report.animated.bones.length, 65);
  assert.deepEqual(report.comparison.missing, []);
  assert.deepEqual(report.comparison.added, []);
  assert.deepEqual(report.comparison.reparented, []);
  assert.ok(report.comparison.maxRestWorldDelta < 0.0001, 'rest rig changed by more than 0.1 mm');
  assert.ok(report.comparison.maxRestLocalAngle < 0.0001, 'local bone axes changed');
  assert.ok(report.comparison.maxRestWorldAngle < 0.0001, 'world bone axes changed');
  assert.ok(report.comparison.maxLocalScaleDelta < 0.00001, 'bone scales changed');
  const primaryMeshes = report.animated.meshes.filter((mesh) => mesh.character);
  assert.equal(primaryMeshes.length, report.original.meshes.length);
  assert.deepEqual(
    primaryMeshes.map((mesh) => mesh.morphs.length),
    report.original.meshes.map((mesh) => mesh.morphs.length),
  );
  const clip = report.animated.clips.find((clip) => clip.name === report.defaultClip)!;
  assert.ok(clip.duration > 0 && clip.characterTracks > 0);
  assert.equal(clip.auxiliaryTracks, 0, 'selected walking clip binds to the wrong rig');
  assert.deepEqual(clip.unresolved, []);
  assert.equal(report.deformation!.nonFiniteVertices, 0);
  assert.ok(report.deformation!.meshes.every((mesh) => Number.isFinite(mesh.maxEdgeGrowth)));
  for (const limb of ['LeftHand', 'RightHand', 'LeftFoot', 'RightFoot']) {
    const range = report.walking!.motion[limb].rangeFromHips;
    assert.ok(range.every(Number.isFinite));
    assert.ok(Math.hypot(...range) > 0.05, `${limb} does not move relative to hips`);
  }
  context.diagnostic(
    JSON.stringify({
      comparison: report.comparison,
      walking: report.walking,
      deformation: report.deformation,
    }),
  );
  const trial = clone(animated.scene);
  isolateWalkingCharacter(trial);
  const bones: Bone[] = [],
    meshes: Mesh[] = [];
  trial.traverse((node) => {
    if (node instanceof Bone) bones.push(node);
    if (node instanceof Mesh) meshes.push(node);
  });
  assert.equal(bones.length, 65, 'source FBX bones must not reach gameplay rig helpers');
  assert.equal(meshes.length, 8);
  const walk = createImportedWalk(trial, animated.animations);
  const restPositions = bones.map((bone) => bone.position.toArray());
  const phases: number[] = [];
  for (const rate of [20, 30, 60, 120]) {
    walk.step(1 / rate, 0, false, true);
    for (let i = 0; i < rate; i++) {
      walk.resetPose();
      walk.step(1 / rate, 1.2 / rate, true, false);
      walk.apply(true);
      assert.ok(walk.debug.time >= 1 / 30, 'bad first export key is excluded');
      assert.ok(bones.every((bone) => bone.quaternion.toArray().every(Number.isFinite)));
    }
    phases.push(walk.debug.phase);
    assert.ok(walk.debug.applied >= 14, 'authored limb tracks must be applied');
    assert.deepEqual(
      bones.map((bone) => bone.position.toArray()),
      restPositions,
      'clip root translation must never move the gameplay model',
    );
    const phase = walk.debug.phase;
    walk.step(0.2, 0, false, false);
    assert.equal(walk.debug.phase, phase, 'stationary input does not advance walking');
    walk.step(0.2, 0, false, true);
    assert.equal(walk.debug.weight, 0, 'protected/special poses immediately return to existing IK');
    walk.resetPose();
  }
  assert.ok(
    Math.max(...phases) - Math.min(...phases) < 1e-12,
    'cadence follows distance at every frame rate',
  );
});
