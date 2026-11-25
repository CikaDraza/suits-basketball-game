import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AnimationClip,
  AnimationMixer,
  Bone,
  Group,
  Mesh,
  QuaternionKeyframeTrack,
  Texture,
} from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { ANIMATION_PATHS, MODEL_PATHS } from '../src/game/assets/manifest';
import { bindAnimationClip } from '../src/game/assets/animationClip';
import { isolateWalkingCharacter } from '../src/game/entities/importedWalk';

test('defense clip drives only the existing Shaq rig while preserving cached assets', async () => {
  const loader = new GLTFLoader();
  const textures: Texture[] = [];
  loader.register(() => ({
    name: 'CPUAnimationTextures',
    loadTexture: async () => {
      const texture = new Texture();
      textures.push(texture);
      return texture;
    },
  }));
  const load = async (path: string) => {
    const bytes = await readFile(new URL(`../public/${path}`, import.meta.url));
    return loader.parseAsync(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
      '',
    );
  };
  const [active, source] = await Promise.all([
    load(MODEL_PATHS.shaq),
    load(ANIMATION_PATHS.shaq.defense),
  ]);
  const target = clone(active.scene);
  isolateWalkingCharacter(target);
  const sourceClip = source.animations.find((clip) => clip.name === 'SHAQ_DEFENSE_SEQUENCE_V01')!;
  const originalNames = sourceClip.tracks.map((track) => track.name);
  const originalHips = source.scene.getObjectByName('mixamorigHips')!.quaternion.toArray();
  const activeHips = active.scene.getObjectByName('mixamorigHips')!.quaternion.toArray();
  const { clip, report } = bindAnimationClip(source.scene, target, sourceClip);
  assert.equal(report.bones, 65);
  assert.equal(report.tracks, 195);
  assert.ok(Math.abs(clip.duration - 16 / 3) < 1e-5);
  const meshes: Mesh[] = [];
  target.traverse((node) => {
    if (node instanceof Mesh) meshes.push(node);
  });
  assert.equal(meshes.length, 8, 'only active Shaq meshes are present');
  const mixer = new AnimationMixer(target);
  const action = mixer.clipAction(clip).play();
  const samples: number[][] = [];
  for (const time of [0, 1, 2, 3, 4, 5.3]) {
    action.time = time;
    mixer.update(0);
    const pose: number[] = [];
    target.traverse((node) => {
      if (!(node instanceof Bone)) return;
      pose.push(...node.position.toArray(), ...node.quaternion.toArray(), ...node.scale.toArray());
    });
    assert.ok(pose.every(Number.isFinite));
    samples.push(target.getObjectByName('mixamorigLeftArm')!.quaternion.toArray());
  }
  assert.ok(samples.some((pose) => pose.some((v, i) => Math.abs(v - samples[0][i]) > 0.1)));
  assert.deepEqual(
    sourceClip.tracks.map((track) => track.name),
    originalNames,
  );
  assert.deepEqual(
    source.scene.getObjectByName('mixamorigHips')!.quaternion.toArray(),
    originalHips,
  );
  assert.deepEqual(active.scene.getObjectByName('mixamorigHips')!.quaternion.toArray(), activeHips);
  mixer.stopAllAction();
  mixer.uncacheRoot(target);
  textures.forEach((texture) => texture.dispose());
});

test('direct clip binding rejects missing bones, different parents, rest axes and non-bone tracks', () => {
  const rig = () => {
    const root = new Group();
    const hips = new Bone();
    hips.name = 'Hips';
    const arm = new Bone();
    arm.name = 'Arm';
    root.add(hips);
    hips.add(arm);
    return root;
  };
  const clip = new AnimationClip('defense', 1, [
    new QuaternionKeyframeTrack('Arm.quaternion', [0, 1], [0, 0, 0, 1, 0, 0.5, 0, 0.8660254]),
  ]);
  const source = rig();
  const missing = rig();
  missing.getObjectByName('Arm')!.removeFromParent();
  assert.throws(() => bindAnimationClip(source, missing, clip), /bone counts/);
  const reparented = rig();
  reparented.add(reparented.getObjectByName('Arm')!);
  assert.throws(() => bindAnimationClip(source, reparented, clip), /hierarchy/);
  const rotated = rig();
  rotated.getObjectByName('Arm')!.rotation.x = 0.3;
  assert.throws(() => bindAnimationClip(source, rotated, clip), /rest transforms/);
  const invalid = clip.clone();
  invalid.tracks[0].name = '.quaternion';
  assert.throws(() => bindAnimationClip(source, rig(), invalid), /Unsupported/);
});
