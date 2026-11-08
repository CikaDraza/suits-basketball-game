import {
  AnimationMixer,
  LoopOnce,
  SkinnedMesh,
  Vector3,
  type AnimationClip,
  type Object3D,
} from 'three';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { characterRoot } from './assets';

/** Offline inspection of every character vertex/triangle, on an independent skeleton. */
export function auditDeformation(source: Object3D, clip: AnimationClip, samples = 33) {
  const scene = clone(source);
  scene.updateMatrixWorld(true);
  const meshes: SkinnedMesh[] = [];
  characterRoot(scene).traverse((node) => {
    if (node instanceof SkinnedMesh) meshes.push(node);
  });
  const point = new Vector3();
  const records = meshes.map((mesh) => {
    const count = mesh.geometry.getAttribute('position').count;
    const positions = new Float64Array(count * 3);
    const readPositions = () => {
      for (let i = 0; i < count; i++) {
        mesh.getVertexPosition(i, point).applyMatrix4(mesh.matrixWorld);
        positions.set(point.toArray(), i * 3);
      }
    };
    readPositions();
    const index = mesh.geometry.index;
    const edges: { a: number; b: number; rest: number }[] = [];
    const length = index?.count ?? count;
    const edgeLength = (a: number, b: number) =>
      Math.hypot(
        positions[a * 3] - positions[b * 3],
        positions[a * 3 + 1] - positions[b * 3 + 1],
        positions[a * 3 + 2] - positions[b * 3 + 2],
      );
    for (let i = 0; i < length; i += 3) {
      const vertices = [0, 1, 2].map((offset) => (index ? index.getX(i + offset) : i + offset));
      for (let corner = 0; corner < 3; corner++) {
        const a = vertices[corner],
          b = vertices[(corner + 1) % 3];
        edges.push({ a, b, rest: edgeLength(a, b) });
      }
    }
    return {
      mesh,
      count,
      positions,
      edges,
      readPositions,
      edgeLength,
      maxEdgeGrowth: 0,
      maxEdgeRatio: 1,
      peak: null as {
        time: number;
        a: number;
        b: number;
        rest: number;
        length: number;
        position: number[];
        bones: string[];
      } | null,
    };
  });
  const mixer = new AnimationMixer(scene);
  const action = mixer.clipAction(clip).setLoop(LoopOnce, 1);
  action.clampWhenFinished = true;
  action.play();
  let nonFiniteVertices = 0,
    minY = Infinity,
    maxY = -Infinity;
  for (let frame = 0; frame < samples; frame++) {
    mixer.setTime((frame / (samples - 1)) * clip.duration);
    scene.updateMatrixWorld(true);
    for (const record of records) {
      record.readPositions();
      for (let i = 0; i < record.count; i++) {
        const values = record.positions.subarray(i * 3, i * 3 + 3);
        if (!values.every(Number.isFinite)) nonFiniteVertices++;
        minY = Math.min(minY, values[1]);
        maxY = Math.max(maxY, values[1]);
      }
      for (const edge of record.edges) {
        const length = record.edgeLength(edge.a, edge.b);
        if (length - edge.rest > record.maxEdgeGrowth) {
          const skinIndex = record.mesh.geometry.getAttribute('skinIndex');
          const skinWeight = record.mesh.geometry.getAttribute('skinWeight');
          const bones = new Set<string>();
          for (const vertex of [edge.a, edge.b])
            for (let component = 0; component < 4; component++)
              if (skinWeight.getComponent(vertex, component) > 0.01)
                bones.add(
                  record.mesh.skeleton.bones[skinIndex.getComponent(vertex, component)].name,
                );
          record.peak = {
            time: (frame / (samples - 1)) * clip.duration,
            a: edge.a,
            b: edge.b,
            rest: edge.rest,
            length,
            position: Array.from(record.positions.subarray(edge.a * 3, edge.a * 3 + 3)),
            bones: [...bones],
          };
        }
        record.maxEdgeGrowth = Math.max(record.maxEdgeGrowth, length - edge.rest);
        if (edge.rest > 0.0005)
          record.maxEdgeRatio = Math.max(record.maxEdgeRatio, length / edge.rest);
      }
    }
  }
  mixer.stopAllAction();
  mixer.uncacheRoot(scene);
  new Set(meshes.map((mesh) => mesh.skeleton)).forEach((skeleton) => skeleton.dispose());
  return {
    samples,
    nonFiniteVertices,
    minY,
    maxY,
    meshes: records.map(({ mesh, count, edges, maxEdgeGrowth, maxEdgeRatio, peak }) => ({
      name: mesh.name,
      vertices: count,
      edgesCheckedPerPose: edges.length,
      maxEdgeGrowth,
      maxEdgeRatio,
      peak,
    })),
  };
}
