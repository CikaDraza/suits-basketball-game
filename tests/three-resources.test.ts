import assert from 'node:assert/strict';
import test from 'node:test';
import {
  Bone,
  BufferGeometry,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshBasicMaterial,
  Skeleton,
  SkinnedMesh,
} from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { createFaceController } from '../src/game/entities/faceController';
import { COURT } from '../src/game/court/constants';
import {
  applyRimAngularImpulse,
  createHoopRig,
  hangOnRim,
  hoop,
  hoopImpulse,
  resetHoop,
  stepSpring,
} from '../src/game/court/hoopRig';

const MORPHS = [
  'eyeBlinkLeft',
  'eyeBlinkRight',
  'jawOpen',
  'eyeLookLeft',
  'eyeLookRight',
  'eyeLookUp',
  'eyeLookDown',
];

function createCharacterFixture() {
  const root = new Group();
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3));
  geometry.morphAttributes.position = MORPHS.map((name) => {
    const attribute = geometry.attributes.position.clone();
    attribute.name = name;
    return attribute;
  });
  const material = new MeshBasicMaterial();
  const bone = new Bone();
  root.add(bone);
  const meshes = ['Face', 'EyeLeft', 'EyeRight'].map((name) => {
    const mesh = new SkinnedMesh(geometry, material);
    mesh.name = name;
    root.add(mesh);
    mesh.bind(new Skeleton([bone]));
    return mesh;
  });
  return {
    root,
    meshes,
    geometry,
    material,
    dispose() {
      for (const mesh of meshes) mesh.skeleton.dispose();
      geometry.dispose();
      material.dispose();
    },
  };
}

function morph(mesh: Mesh, name: string): number {
  const index = mesh.morphTargetDictionary?.[name];
  assert.notEqual(index, undefined, `Missing fixture morph: ${name}`);
  return mesh.morphTargetInfluences![index!];
}

test('facial morphs clamp values and attenuate each eye gaze by its own blink', (context) => {
  const character = createCharacterFixture();
  context.after(() => character.dispose());
  const [face, left, right] = character.meshes;
  const updateFace = createFaceController(character.root);

  updateFace({ blinkLeft: 1.5, blinkRight: 0.25, jawOpen: 2, gazeX: -2, gazeY: 0.5 });
  assert.equal(morph(face, 'eyeBlinkLeft'), 1);
  assert.equal(morph(face, 'jawOpen'), 1);
  assert.equal(morph(face, 'eyeLookLeft'), 1);
  assert.equal(morph(face, 'eyeLookUp'), 0.5);
  assert.equal(morph(left, 'eyeLookLeft'), 0);
  assert.equal(morph(left, 'eyeLookUp'), 0);
  assert.equal(morph(right, 'eyeLookLeft'), 0.75);
  assert.equal(morph(right, 'eyeLookUp'), 0.375);

  updateFace({ blinkLeft: 0.5, jawOpen: -1, gazeX: Number.NaN });
  assert.equal(morph(right, 'eyeBlinkRight'), 0.5);
  assert.equal(morph(face, 'jawOpen'), 0);
  assert.equal(morph(face, 'eyeLookLeft'), 0);
  assert.equal(morph(face, 'eyeLookUp'), 0);

  updateFace();
  assert.ok(
    character.meshes.every((mesh) => mesh.morphTargetInfluences!.every((value) => value === 0)),
  );
});

test('morph updates and skeleton disposal stay isolated from the cached source model', (context) => {
  const source = createCharacterFixture();
  context.after(() => source.dispose());
  const clone = cloneSkinned(source.root);
  const clonedMeshes = source.meshes.map((mesh) => clone.getObjectByName(mesh.name) as SkinnedMesh);
  context.after(() => clonedMeshes.forEach((mesh) => mesh.skeleton.dispose()));
  const [sourceFace] = source.meshes;
  const [clonedFace] = clonedMeshes;

  assert.equal(clonedFace.geometry, sourceFace.geometry);
  assert.equal(clonedFace.material, sourceFace.material);
  assert.notEqual(clonedFace.morphTargetInfluences, sourceFace.morphTargetInfluences);
  assert.notEqual(clonedFace.skeleton, sourceFace.skeleton);
  assert.notEqual(clonedFace.skeleton.bones[0], sourceFace.skeleton.bones[0]);

  createFaceController(clone)({ jawOpen: 0.75, blinkLeft: 0.5 });
  assert.equal(morph(clonedFace, 'jawOpen'), 0.75);
  assert.equal(morph(sourceFace, 'jawOpen'), 0);

  sourceFace.skeleton.computeBoneTexture();
  clonedFace.skeleton.computeBoneTexture();
  const sourceTexture = sourceFace.skeleton.boneTexture;
  const clonedTexture = clonedFace.skeleton.boneTexture;
  assert.notEqual(clonedTexture, sourceTexture);
  let sourceTextureDisposals = 0;
  sourceTexture!.addEventListener('dispose', () => sourceTextureDisposals++);
  let cachedResourceDisposals = 0;
  source.geometry.addEventListener('dispose', () => cachedResourceDisposals++);
  source.material.addEventListener('dispose', () => cachedResourceDisposals++);

  // React StrictMode can clean an effect and then retain its memoized model for setup.
  clonedFace.skeleton.dispose();
  assert.equal(clonedFace.skeleton.boneTexture, null);
  assert.equal(sourceTextureDisposals, 0);
  assert.equal(cachedResourceDisposals, 0);
  assert.equal(sourceFace.skeleton.boneTexture, sourceTexture);
  // WebGLRenderer recreates the clone's bone texture on its next draw.
  clonedFace.skeleton.computeBoneTexture();
  assert.ok(clonedFace.skeleton.boneTexture);
  assert.notEqual(clonedFace.skeleton.boneTexture, clonedTexture);
  assert.deepEqual(
    clonedFace.skeleton.bones.map((bone) => bone.name),
    sourceFace.skeleton.bones.map((bone) => bone.name),
  );
});

test('facial controller tolerates meshes with absent or partial morph targets', (context) => {
  const character = createCharacterFixture();
  context.after(() => character.dispose());
  const [face, left, right] = character.meshes;
  face.morphTargetDictionary = { jawOpen: 2 };
  left.morphTargetDictionary = undefined;
  right.morphTargetInfluences = undefined;
  createFaceController(character.root)({ jawOpen: 0.6, gazeX: 1 });
  assert.equal(face.morphTargetInfluences![2], 0.6);
  assert.equal(face.morphTargetInfluences![3], 0);
});

test('hoop springs respect hard limits and settle after an impulse', () => {
  const rig = createHoopRig();
  const spring = rig.rimZ;
  spring.angle = spring.max - 0.001;
  spring.vel = 100;
  stepSpring(spring, 1 / 120);
  assert.equal(spring.angle, spring.max);
  assert.ok(spring.vel <= 0);
  spring.angle = spring.min + 0.001;
  spring.vel = -100;
  stepSpring(spring, 1 / 120);
  assert.equal(spring.angle, spring.min);
  assert.ok(spring.vel >= 0);

  const fresh = createHoopRig();
  applyRimAngularImpulse(fresh, 0.6, -0.4, -2);
  assert.ok(fresh.rimX.vel > 0);
  assert.ok(fresh.rimY.vel < 0);
  assert.ok(fresh.hinge1.vel < 0 && fresh.hinge2.vel < 0);
  for (let frame = 0; frame < 600; frame++) {
    for (const joint of Object.values(fresh)) {
      stepSpring(joint, 1 / 120);
      assert.ok(joint.angle >= joint.min && joint.angle <= joint.max);
    }
  }
  assert.ok(
    Object.values(fresh).every(
      (joint) => Math.abs(joint.angle) < 1e-5 && Math.abs(joint.vel) < 1e-5,
    ),
  );
});

test('resetting the hoop removes hang forces and stale world-space grips', (context) => {
  context.after(resetHoop);
  resetHoop();
  const rigReference = hoop.rig;
  applyRimAngularImpulse(hoop.rig, 1, -1, -3);
  hangOnRim(2, 200, 3, 5);
  assert.equal(hoop.hang.local.z, 0.17);
  hoopImpulse([1, 2, 3], [4, 5, 6]);
  hoop.rimWorld.set(4, 5, 6);
  hoop.gripWorld.set(7, 8, 9);

  resetHoop();
  assert.equal(hoop.rig, rigReference);
  assert.deepEqual(hoop.rig, createHoopRig());
  assert.equal(hoop.impulses.length, 0);
  assert.equal(hoop.hang.remaining, 0);
  assert.equal(hoop.hang.force, 0);
  assert.equal(hoop.hang.slam, 0);
  assert.deepEqual(hoop.hang.local.toArray(), [0.2, 0, 0]);
  assert.deepEqual(hoop.rimWorld.toArray(), [COURT.BASKET_X, COURT.RIM_Y, 0]);
  assert.deepEqual(hoop.gripWorld.toArray(), [COURT.BASKET_X + 0.2, COURT.RIM_Y, 0]);
});
