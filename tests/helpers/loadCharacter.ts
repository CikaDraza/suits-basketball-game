import { readFile } from 'node:fs/promises';
import { Bone, Mesh, Object3D, SkinnedMesh, Texture } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import type { Legend } from '../../src/game/data/gameConfig';
export async function loadCharacter(legend: Legend) {
  const loader = new GLTFLoader();
  const textures: Texture[] = [];
  loader.register(() => ({
    name: 'CPUContactTextures',
    loadTexture: async () => {
      const texture = new Texture();
      textures.push(texture);
      return texture;
    },
  }));
  const file = legend === 'shaq' ? 'shaquille_oneal' : 'charles_barkley';
  const bytes = await readFile(new URL(`../../public/models/${file}.glb`, import.meta.url));
  const gltf = await loader.parseAsync(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    '',
  );
  const model = clone(gltf.scene),
    second = clone(gltf.scene);
  const bones: Record<string, Bone> = {};
  model.traverse((o) => {
    if (o instanceof Bone) bones[o.name.replace(/^mixamorig:?/, '')] = o;
  });
  const rest = Object.values(bones).map((bone) => ({
    bone,
    q: bone.quaternion.clone(),
    p: bone.position.clone(),
  }));
  return {
    model,
    second,
    bones,
    clips: gltf.animations,
    reset() {
      rest.forEach(({ bone, q, p }) => {
        bone.quaternion.copy(q);
        bone.position.copy(p);
      });
      model.updateMatrixWorld(true);
    },
    dispose() {
      const geometries = new Set<Mesh['geometry']>(),
        materials = new Set(),
        skeletons = new Set<SkinnedMesh['skeleton']>();
      for (const root of [model, second, gltf.scene])
        root.traverse((o: Object3D) => {
          if (o instanceof Mesh) {
            geometries.add(o.geometry);
            (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) =>
              materials.add(m),
            );
          }
          if (o instanceof SkinnedMesh) skeletons.add(o.skeleton);
        });
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => (m as { dispose(): void }).dispose());
      skeletons.forEach((s) => s.dispose());
      textures.forEach((t) => t.dispose());
    },
  };
}
