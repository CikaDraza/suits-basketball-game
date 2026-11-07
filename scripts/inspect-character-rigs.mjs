import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { Bone, Box3, Euler, Mesh, Quaternion, SkinnedMesh, Texture, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { createLimbIK } from '../src/game/entities/limbIK.ts';
const output = {};
for (const [legend, file] of [
  ['shaq', 'shaquille_oneal'],
  ['chuck', 'charles_barkley'],
]) {
  const bytes = await readFile(new URL(`../public/models/${file}.glb`, import.meta.url));
  const loader = new GLTFLoader();
  loader.register(() => ({ name: 'AuditTextures', loadTexture: async () => new Texture() }));
  const gltf = await loader.parseAsync(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    '',
  );
  const model = clone(gltf.scene),
    second = clone(gltf.scene);
  model.updateMatrixWorld(true);
  const bones = {};
  model.traverse((o) => {
    if (o instanceof Bone) bones[o.name.replace(/^mixamorig:?/, '')] = o;
  });
  const other = new Set();
  second.traverse((o) => {
    if (o instanceof Bone) other.add(o);
  });
  const v = new Vector3(),
    q = new Quaternion();
  const entry = {
    sha256: createHash('sha256').update(bytes).digest('hex'),
    clips: gltf.animations.map((c) => ({
      name: c.name,
      duration: c.duration,
      tracks: c.tracks.length,
    })),
    bounds: new Box3().setFromObject(model).getSize(v).toArray(),
    independentSkeletons: Object.values(bones).every((b) => !other.has(b)),
    bones: {},
    palms: {},
  };
  for (const side of ['Left', 'Right']) {
    for (const suffix of [
      'Shoulder',
      'Arm',
      'ForeArm',
      'Hand',
      'HandIndex1',
      'HandMiddle1',
      'HandRing1',
      'HandPinky1',
    ]) {
      const name = side + suffix,
        b = bones[name];
      if (!b) continue;
      b.getWorldQuaternion(q);
      entry.bones[name] = {
        parent: b.parent.name,
        localPosition: b.position.toArray(),
        localQuaternion: b.quaternion.toArray(),
        worldPosition: b.getWorldPosition(v).toArray(),
        worldQuaternion: q.toArray(),
        axes: [
          [1, 0, 0],
          [0, 1, 0],
          [0, 0, 1],
        ].map((a) => new Vector3(...a).applyQuaternion(q).toArray()),
      };
    }
    const hand = bones[side + 'Hand'];
    const wrist = hand.getWorldPosition(new Vector3());
    const knuckles = ['Index', 'Middle', 'Ring', 'Pinky'].map((f) =>
      bones[side + 'Hand' + f + '1'].getWorldPosition(new Vector3()),
    );
    const mid = knuckles.reduce((s, p) => s.add(p), new Vector3()).multiplyScalar(0.25);
    const center = wrist.clone().lerp(mid, 0.55);
    const along = mid.clone().sub(wrist).normalize();
    const across = knuckles[0].clone().sub(knuckles[3]).normalize();
    const normal = new Vector3().crossVectors(along, across).normalize();
    entry.palms[side] = {
      wrist: wrist.toArray(),
      knuckleMid: mid.toArray(),
      localCenter: hand.worldToLocal(center.clone()).toArray(),
      localAlong: along
        .clone()
        .applyQuaternion(hand.getWorldQuaternion(new Quaternion()).invert())
        .toArray(),
      localNormal: normal
        .clone()
        .applyQuaternion(hand.getWorldQuaternion(new Quaternion()).invert())
        .toArray(),
      fingerSpread: knuckles[0].distanceTo(knuckles[3]),
    };
  }
  entry.meshes = [];
  model.traverse((o) => {
    if (o instanceof SkinnedMesh)
      entry.meshes.push({
        name: o.name,
        vertices: o.geometry.getAttribute('position').count,
        bones: o.skeleton.bones.length,
        morphs: Object.keys(o.morphTargetDictionary ?? {}),
      });
  });
  // Reproduce the prior arm solver: upper/fore FK resets, hand rotation persists.
  const rest = Object.values(bones).map((b) => [b, b.quaternion.clone()]);
  const bindWorld = new Map(
    Object.values(bones).map((b) => [b, b.getWorldQuaternion(new Quaternion())]),
  );
  const drive = (b, x, y, z) => {
    const q = bindWorld.get(b);
    b.quaternion.copy(rest.find(([bone]) => bone === b)[1]).multiply(
      q
        .clone()
        .invert()
        .multiply(new Quaternion().setFromEuler(new Euler(x, y, z)))
        .multiply(q),
    );
  };
  entry.oldPostWristProbe = [];
  const oldSolvers = ['Left', 'Right'].map((side) =>
    createLimbIK(bones[side + 'Arm'], bones[side + 'ForeArm'], bones[side + 'Hand']),
  );
  for (let frame = 0; frame < 10; frame++) {
    for (const [index, side] of ['Left', 'Right'].entries()) {
      drive(bones[side + 'Arm'], -0.45, 0, index === 0 ? -0.85 : 0.85);
      drive(bones[side + 'ForeArm'], 0, index === 0 ? -1.6 : 1.6, 0);
    }
    model.updateMatrixWorld(true);
    const center = bones.LeftArm.getWorldPosition(new Vector3())
      .add(bones.RightArm.getWorldPosition(new Vector3()))
      .multiplyScalar(0.5);
    center.y -= entry.bounds[1] * 0.13;
    center.z += 0.36;
    for (let i = 0; i < 2; i++)
      oldSolvers[i](
        center.clone().add(new Vector3(i === 0 ? 0.15 : -0.15, 0, 0)),
        new Vector3(i === 0 ? 1 : -1, 0, 0),
      );
    entry.oldPostWristProbe.push(
      ['Left', 'Right'].map(
        (side) =>
          (bones[side + 'Hand'].quaternion
            .clone()
            .normalize()
            .angleTo(
              rest
                .find(([b]) => b === bones[side + 'Hand'])[1]
                .clone()
                .normalize(),
            ) *
            180) /
          Math.PI,
      ),
    );
  }
  rest.forEach(([b, q]) => b.quaternion.copy(q));
  model.updateMatrixWorld(true);
  output[legend] = entry;
  console.log(
    legend,
    JSON.stringify({
      bounds: entry.bounds,
      clips: entry.clips,
      independent: entry.independentSkeletons,
      palms: entry.palms,
      oldPostWristProbe: entry.oldPostWristProbe,
    }),
  );
  const geometries = new Set(),
    materials = new Set(),
    skeletons = new Set();
  for (const root of [model, second, gltf.scene])
    root.traverse((o) => {
      if (o instanceof Mesh) {
        geometries.add(o.geometry);
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) materials.add(m);
      }
      if (o instanceof SkinnedMesh) skeletons.add(o.skeleton);
    });
  geometries.forEach((g) => g.dispose());
  materials.forEach((m) => m.dispose());
  skeletons.forEach((s) => s.dispose());
}
await writeFile(
  new URL('../docs/slice2-rig-audit.json', import.meta.url),
  JSON.stringify(output, null, 2) + '\n',
);
