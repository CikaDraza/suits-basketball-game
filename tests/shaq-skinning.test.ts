import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { Bone, Mesh, Quaternion, SkinnedMesh, Texture, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import report from '../docs/shaq-skinning-report.json';
import { MODEL_ARCHIVES } from '../src/game/assets/manifest';
import { isolateWalkingCharacter } from '../src/game/entities/importedWalk';

const assetURL = new URL('../public/models/shaquille_oneal.glb', import.meta.url);
const digest = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

test('the repaired Shaq asset changes only skin indices/weights and matches the authoring copy', async () => {
  const bytes = await readFile(
    new URL(`../public/${MODEL_ARCHIVES.shaqOriginal}`, import.meta.url),
  );
  const authoring = await readFile(
    new URL('../Basketball_Characters/models/shaquille_oneal.glb', import.meta.url),
  );
  assert.equal(bytes.length, report.byteLength);
  assert.equal(digest(bytes), report.repairedSha256);
  assert.equal(digest(authoring), report.repairedSha256);
  const preserved = createHash('sha256');
  let start = 0;
  for (const [lo, hi] of report.allowedByteRanges) {
    preserved.update(bytes.subarray(start, lo));
    start = hi;
  }
  preserved.update(bytes.subarray(start));
  assert.equal(
    preserved.digest('hex'),
    report.unchangedBytesSha256,
    'Positions, triangles, normals, UVs, images, bind matrices, rig, morphs and animation must stay unchanged.',
  );
});

test('real Shaq skinning survives 324 finger/wrist poses without spikes or opposite-hand motion', async (context) => {
  const loader = new GLTFLoader();
  const textures: Texture[] = [];
  // CPU skinning needs no image decoder, but still uses the actual GLTFLoader and rig.
  loader.register(() => ({
    name: 'CpuSkinningTextures',
    loadTexture: async () => {
      const texture = new Texture();
      textures.push(texture);
      return texture;
    },
  }));
  const bytes = await readFile(assetURL);
  const gltf = await loader.parseAsync(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    '',
  );
  isolateWalkingCharacter(gltf.scene);
  const bones: Bone[] = [];
  let body: SkinnedMesh | undefined;
  gltf.scene.traverse((object) => {
    if (object instanceof Bone) bones.push(object);
    if (object instanceof SkinnedMesh && object.name === 'Shaquille_ONeal_Mesh') body = object;
  });
  assert.equal(bones.length, 65);
  assert.ok(body);
  const mesh = body;
  context.after(() => {
    gltf.scene.traverse((object) => {
      if (object instanceof Mesh) {
        object.geometry.dispose();
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.forEach((material) => material.dispose());
      }
      if (object instanceof SkinnedMesh) object.skeleton.dispose();
    });
    textures.forEach((texture) => texture.dispose());
  });

  const joints = mesh.geometry.getAttribute('skinIndex');
  const weights = mesh.geometry.getAttribute('skinWeight');
  for (let vertex = 0; vertex < weights.count; vertex++) {
    let sum = 0;
    for (let component = 0; component < 4; component++) {
      const weight = weights.getComponent(vertex, component);
      assert.ok(Number.isFinite(weight) && weight >= 0 && weight <= 1);
      assert.ok(joints.getComponent(vertex, component) < 65);
      sum += weight;
    }
    assert.ok(Math.abs(sum - 1) < 2e-7);
  }

  const rest = new Map(bones.map((bone) => [bone, bone.quaternion.clone()]));
  const restPositions = new Float64Array(weights.count * 3);
  const posed = new Float64Array(restPositions.length);
  const point = new Vector3();
  function positions(output: Float64Array) {
    gltf.scene.updateMatrixWorld(true);
    for (let vertex = 0; vertex < weights.count; vertex++) {
      mesh.getVertexPosition(vertex, point).applyMatrix4(mesh.matrixWorld);
      point.toArray(output, vertex * 3);
    }
  }
  positions(restPositions);
  const index = mesh.geometry.index!;
  const edgeKeys = new Set<number>();
  for (let triangle = 0; triangle < index.count; triangle += 3) {
    const vertices = [index.getX(triangle), index.getX(triangle + 1), index.getX(triangle + 2)];
    for (let corner = 0; corner < 3; corner++) {
      const first = vertices[corner];
      const second = vertices[(corner + 1) % 3];
      edgeKeys.add(Math.min(first, second) * weights.count + Math.max(first, second));
    }
  }
  const length = (output: Float64Array, a: number, b: number) =>
    Math.hypot(
      output[a * 3] - output[b * 3],
      output[a * 3 + 1] - output[b * 3 + 1],
      output[a * 3 + 2] - output[b * 3 + 2],
    );
  const edges = [...edgeKeys].map((key) => {
    const a = Math.floor(key / weights.count);
    const b = key % weights.count;
    return { a, b, rest: length(restPositions, a, b) };
  });
  let poses = 0;
  let maximumGrowth = 0;
  let maximumRatio = 0;
  let maximumOppositeMotion = 0;
  for (const side of ['Left', 'Right']) {
    const handBones = bones.filter((bone) => bone.name.startsWith(`mixamorig${side}Hand`));
    const groups = [handBones.filter((bone) => bone.name === `mixamorig${side}Hand`)];
    for (const finger of ['Thumb', 'Index', 'Middle', 'Ring', 'Pinky']) {
      for (let joint = 1; joint <= 4; joint++)
        groups.push(handBones.filter((bone) => bone.name.endsWith(`${finger}${joint}`)));
      groups.push(
        handBones.filter((bone) => bone.name.includes(finger) && !bone.name.endsWith('4')),
      );
    }
    groups.push(handBones.filter((bone) => /[123]$/.test(bone.name)));
    for (const group of groups) {
      assert.ok(group.length > 0);
      for (const axis of [new Vector3(1, 0, 0), new Vector3(0, 1, 0), new Vector3(0, 0, 1)]) {
        for (const angle of [-70, 70]) {
          for (const [bone, quaternion] of rest) bone.quaternion.copy(quaternion);
          const rotation = new Quaternion().setFromAxisAngle(axis, (angle * Math.PI) / 180);
          group.forEach((bone) => bone.quaternion.multiply(rotation));
          positions(posed);
          for (const edge of edges) {
            const current = length(posed, edge.a, edge.b);
            maximumGrowth = Math.max(maximumGrowth, current - edge.rest);
            maximumRatio = Math.max(maximumRatio, current / Math.max(edge.rest, 1e-5));
          }
          for (let vertex = 0; vertex < weights.count; vertex++) {
            const x = restPositions[vertex * 3];
            const y = restPositions[vertex * 3 + 1];
            const opposite = side === 'Left' ? x < -0.75 : x > 0.75;
            if (opposite && y > 1.65)
              maximumOppositeMotion = Math.max(
                maximumOppositeMotion,
                Math.hypot(
                  posed[vertex * 3] - x,
                  posed[vertex * 3 + 1] - y,
                  posed[vertex * 3 + 2] - restPositions[vertex * 3 + 2],
                ),
              );
          }
          poses++;
        }
      }
    }
  }
  assert.equal(poses, 324);
  assert.ok(maximumGrowth < 0.05, `Excessive edge growth: ${maximumGrowth} m`);
  assert.ok(maximumRatio < 6, `Excessive edge stretch ratio: ${maximumRatio}`);
  assert.ok(
    maximumOppositeMotion < 2e-5,
    `A hand moved its opposite side: ${maximumOppositeMotion} m`,
  );
});
