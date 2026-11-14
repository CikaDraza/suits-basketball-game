import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import test from 'node:test';
import { Bone, Quaternion, Texture } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { ANIMATION_PATHS, MODEL_PATHS } from '../src/game/assets/manifest';
import { createImportedDefense } from '../src/game/entities/importedDefense';
import { isolateWalkingCharacter } from '../src/game/entities/importedWalk';

test('real defense clip blends from the visible pose, holds once, yields to gait/ball and resets consistently at 20–120 Hz', async (context) => {
  const loader = new GLTFLoader();
  const textures: Texture[] = [];
  loader.register(() => ({
    name: 'CPUDefenseTextures',
    loadTexture: async () => {
      const texture = new Texture();
      textures.push(texture);
      return texture;
    },
  }));
  context.after(() => textures.forEach((texture) => texture.dispose()));
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
  const endPoses: number[][] = [];
  for (const rate of [20, 30, 60, 120]) {
    const model = clone(active.scene);
    isolateWalkingCharacter(model);
    const defense = createImportedDefense(model, source.scene, source.animations);
    const bones: Bone[] = [];
    model.traverse((node) => {
      if (node instanceof Bone) bones.push(node);
    });
    const transforms = bones.map((bone) => [...bone.position.toArray(), ...bone.scale.toArray()]);
    const arm = model.getObjectByName('mixamorigLeftArm')!;
    const leg = model.getObjectByName('mixamorigLeftUpLeg')!;
    const previousWalk = new Quaternion().setFromAxisAngle({ x: 1, y: 0, z: 0 }, 0.4);
    arm.quaternion.copy(previousWalk);
    defense.step(0, true, true, false, false);
    defense.resetPose();
    defense.apply();
    assert.ok(
      arm.quaternion.angleTo(previousWalk) < 1e-6,
      'entry must start at the visible walk pose',
    );
    for (let frame = 0; frame < rate * 6; frame++) {
      defense.step(1 / rate, true, true, false, false);
      defense.resetPose();
      defense.apply();
      assert.ok(bones.every((bone) => bone.quaternion.toArray().every(Number.isFinite)));
    }
    assert.equal(defense.debug.phase, 'hold');
    assert.equal(defense.debug.time, defense.debug.duration);
    assert.equal(defense.debug.applied, 65);
    assert.equal(defense.debug.appliedLower, 11);
    endPoses.push(arm.quaternion.toArray());
    assert.deepEqual(
      bones.map((bone) => [...bone.position.toArray(), ...bone.scale.toArray()]),
      transforms,
      'root translation and authored scale must not move/stretch the gameplay rig',
    );
    for (let frame = 0; frame < rate; frame++) {
      defense.step(1 / rate, true, true, true, false);
      defense.resetPose();
      leg.quaternion.copy(previousWalk); // stand-in for this frame's foot IK result
      defense.apply();
    }
    assert.equal(defense.debug.appliedLower, 0, 'moving legs remain owned by gait/IK');
    assert.ok(leg.quaternion.angleTo(previousWalk) < 1e-6);
    const beforeExit = arm.quaternion.clone();
    defense.step(0, false, true, true, false);
    defense.resetPose();
    defense.apply();
    assert.ok(
      arm.quaternion.angleTo(beforeExit) < 1e-6,
      'exit must start at the rendered defense pose',
    );
    for (let frame = 0; frame < rate; frame++) {
      defense.step(1 / rate, false, true, true, false);
      defense.resetPose();
      defense.apply();
    }
    assert.equal(defense.debug.phase, 'inactive');
    defense.step(0.1, true, true, false, false);
    defense.step(0.1, true, false, false, false); // possession/catch/special mode wins immediately
    defense.resetPose();
    arm.quaternion.copy(previousWalk);
    defense.apply();
    assert.equal(defense.debug.weight, 0);
    assert.equal(defense.debug.phase, 'inactive');
    assert.ok(arm.quaternion.angleTo(previousWalk) < 1e-6);
    defense.step(0, true, true, false, true);
    assert.equal(defense.debug.time, 0, 'reset never resumes a stale part of the sequence');
  }
  for (const pose of endPoses.slice(1)) assert.deepEqual(pose, endPoses[0]);
});
