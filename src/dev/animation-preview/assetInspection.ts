import {
  AnimationMixer,
  Bone,
  Box3,
  LoopOnce,
  Mesh,
  Object3D,
  PropertyBinding,
  Quaternion,
  SkinnedMesh,
  Vector3,
  type AnimationClip,
} from 'three';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { characterRoot, descendants } from './assets';
import { auditDeformation } from './deformationAudit';

export interface ImportedAsset {
  scene: Object3D;
  animations: AnimationClip[];
}
export function inspectAsset(asset: ImportedAsset) {
  const primary = characterRoot(asset.scene);
  const members = descendants(primary);
  const bones: Bone[] = [];
  const meshes: {
    name: string;
    character: boolean;
    skinned: boolean;
    vertices: number;
    triangles: number;
    joints: number;
    morphs: string[];
    materials: { name: string; colorMap: boolean; normalMap: boolean }[];
  }[] = [];
  const skeletons = new Set<SkinnedMesh['skeleton']>();
  asset.scene.updateMatrixWorld(true);
  asset.scene.traverse((node) => {
    if (node instanceof Bone && members.has(node)) bones.push(node);
    if (!(node instanceof Mesh)) return;
    if (node instanceof SkinnedMesh) skeletons.add(node.skeleton);
    meshes.push({
      name: node.name,
      character: members.has(node),
      skinned: node instanceof SkinnedMesh,
      vertices: node.geometry.getAttribute('position').count,
      triangles: (node.geometry.index?.count ?? node.geometry.getAttribute('position').count) / 3,
      joints: node instanceof SkinnedMesh ? node.skeleton.bones.length : 0,
      morphs: Object.keys(node.morphTargetDictionary ?? {}),
      materials: (Array.isArray(node.material) ? node.material : [node.material]).map((m) => ({
        name: m.name,
        colorMap: 'map' in m && Boolean(m.map),
        normalMap: 'normalMap' in m && Boolean(m.normalMap),
      })),
    });
  });
  return {
    root: primary.name,
    bounds: new Box3().setFromObject(primary, true).getSize(new Vector3()).toArray(),
    skeletons: skeletons.size,
    armatures: [...skeletons].map((skeleton) => ({
      joints: skeleton.bones.length,
      roots: skeleton.bones
        .filter((bone) => !(bone.parent instanceof Bone))
        .map((bone) => ({ joint: bone.name, parent: bone.parent?.name ?? null })),
    })),
    bones: bones.map((bone) => ({
      name: bone.name,
      parent: bone.parent?.name ?? null,
      position: bone.position.toArray(),
      quaternion: bone.quaternion.toArray(),
      scale: bone.scale.toArray(),
      world: bone.getWorldPosition(new Vector3()).toArray(),
      worldQuaternion: bone.getWorldQuaternion(new Quaternion()).toArray(),
    })),
    meshes,
    clips: asset.animations.map((clip) => {
      let characterTracks = 0,
        auxiliaryTracks = 0;
      const unresolved: string[] = [],
        translations: { name: string; range: number[]; net: number[] }[] = [];
      for (const track of clip.tracks) {
        const parsed = PropertyBinding.parseTrackName(track.name);
        const target = PropertyBinding.findNode(asset.scene, parsed.nodeName);
        if (!(target instanceof Object3D)) unresolved.push(track.name);
        else if (members.has(target)) characterTracks++;
        else auxiliaryTracks++;
        if (parsed.propertyName === 'position') {
          const range = [0, 1, 2].map((axis) => {
            let low = Infinity,
              high = -Infinity;
            for (let i = axis; i < track.values.length; i += 3) {
              low = Math.min(low, track.values[i]);
              high = Math.max(high, track.values[i]);
            }
            return high - low;
          });
          const net = [0, 1, 2].map(
            (axis) => track.values[track.values.length - 3 + axis] - track.values[axis],
          );
          translations.push({ name: track.name, range, net });
        }
      }
      return {
        name: clip.name,
        duration: clip.duration,
        tracks: clip.tracks.length,
        characterTracks,
        auxiliaryTracks,
        unresolved,
        translations,
      };
    }),
  };
}

export function compareRigs(original: ImportedAsset, animated: ImportedAsset) {
  const a = inspectAsset(original),
    b = inspectAsset(animated);
  const old = new Map(a.bones.map((bone) => [bone.name, bone]));
  const current = new Map(b.bones.map((bone) => [bone.name, bone]));
  const matched = b.bones.filter((bone) => old.has(bone.name));
  return {
    missing: a.bones.filter((bone) => !current.has(bone.name)).map((bone) => bone.name),
    added: b.bones.filter((bone) => !old.has(bone.name)).map((bone) => bone.name),
    reparented: b.bones
      .filter((bone) => old.has(bone.name) && old.get(bone.name)!.parent !== bone.parent)
      .map((bone) => ({ name: bone.name, before: old.get(bone.name)!.parent, after: bone.parent })),
    maxRestWorldDelta: Math.max(
      0,
      ...b.bones.map((bone) => {
        const previous = old.get(bone.name);
        return previous ? new Vector3(...bone.world).distanceTo(new Vector3(...previous.world)) : 0;
      }),
    ),
    maxRestLocalAngle: Math.max(
      0,
      ...matched.map((bone) =>
        new Quaternion(...bone.quaternion)
          .normalize()
          .angleTo(new Quaternion(...old.get(bone.name)!.quaternion).normalize()),
      ),
    ),
    maxRestWorldAngle: Math.max(
      0,
      ...matched.map((bone) =>
        new Quaternion(...bone.worldQuaternion)
          .normalize()
          .angleTo(new Quaternion(...old.get(bone.name)!.worldQuaternion).normalize()),
      ),
    ),
    maxLocalScaleDelta: Math.max(
      0,
      ...matched.flatMap((bone) =>
        bone.scale.map((value, axis) => Math.abs(value - old.get(bone.name)!.scale[axis])),
      ),
    ),
  };
}

/** Sample an independent skeleton. Never run an audit mixer on the displayed/cached model. */
export function analyzeClip(asset: ImportedAsset, clip: AnimationClip, samples = 65) {
  const scene = clone(asset.scene);
  const root = characterRoot(scene);
  const bones = new Map<string, Bone>();
  root.traverse((node) => {
    if (node instanceof Bone) bones.set(node.name.replace(/^mixamorig:?/, ''), node);
  });
  const mixer = new AnimationMixer(scene);
  const action = mixer.clipAction(clip).setLoop(LoopOnce, 1);
  action.clampWhenFinished = true;
  action.play();
  const points = ['Hips', 'LeftHand', 'RightHand', 'LeftFoot', 'RightFoot'];
  const paths = Object.fromEntries(points.map((name) => [name, [] as number[][]]));
  const localTranslations = new Map<string, Vector3[]>();
  const point = new Vector3();
  for (let sample = 0; sample < samples; sample++) {
    mixer.setTime((sample / (samples - 1)) * clip.duration);
    scene.updateMatrixWorld(true);
    for (const name of points) {
      const bone = bones.get(name);
      if (bone) paths[name].push(bone.getWorldPosition(point).toArray());
    }
    for (const [name, bone] of bones) {
      const positions = localTranslations.get(name) ?? [];
      positions.push(bone.position.clone());
      localTranslations.set(name, positions);
    }
  }
  const motion = Object.fromEntries(
    Object.entries(paths).map(([name, positions]) => {
      const box = new Box3().setFromPoints(positions.map((p) => new Vector3(...p)));
      const first = new Vector3(...(positions[0] ?? [0, 0, 0]));
      const last = new Vector3(...(positions.at(-1) ?? [0, 0, 0]));
      const relative = positions.map((p, index) =>
        new Vector3(...p).sub(new Vector3(...(paths.Hips[index] ?? [0, 0, 0]))),
      );
      return [
        name,
        {
          range: box.getSize(new Vector3()).toArray(),
          net: last.sub(first).toArray(),
          rangeFromHips: new Box3().setFromPoints(relative).getSize(new Vector3()).toArray(),
        },
      ];
    }),
  );
  const translatingBones = [...localTranslations].flatMap(([name, positions]) => {
    const range = new Box3().setFromPoints(positions).getSize(new Vector3());
    return range.length() > 0.0001 ? [{ name, range: range.toArray() }] : [];
  });
  const hips = paths.Hips;
  let largestHipsStep = { from: 0, to: 0, distance: 0 };
  for (let i = 1; i < hips.length; i++) {
    const distance = new Vector3(...hips[i]).distanceTo(new Vector3(...hips[i - 1]));
    if (distance > largestHipsStep.distance)
      largestHipsStep = {
        from: ((i - 1) / (samples - 1)) * clip.duration,
        to: (i / (samples - 1)) * clip.duration,
        distance,
      };
  }
  mixer.stopAllAction();
  mixer.uncacheRoot(scene);
  scene.traverse((node) => {
    if (node instanceof SkinnedMesh) node.skeleton.dispose();
  });
  return {
    name: clip.name,
    duration: clip.duration,
    samples,
    motion,
    translatingBones,
    largestHipsStep,
  };
}

export function inspectComparison(original: ImportedAsset, animated: ImportedAsset) {
  const inspection = inspectAsset(animated);
  const walking = inspection.clips.find(
    (clip) => /retarget/i.test(clip.name) && clip.characterTracks > 0,
  );
  return {
    original: inspectAsset(original),
    animated: inspection,
    comparison: compareRigs(original, animated),
    walking: walking
      ? analyzeClip(
          animated,
          animated.animations.find((clip) => clip.name === walking.name)!,
        )
      : null,
    deformation: walking
      ? auditDeformation(
          animated.scene,
          animated.animations.find((clip) => clip.name === walking.name)!,
        )
      : null,
    defaultClip: walking?.name ?? animated.animations[0]?.name ?? '',
  };
}
export type ComparisonReport = ReturnType<typeof inspectComparison>;
