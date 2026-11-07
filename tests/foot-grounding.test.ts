import assert from 'node:assert/strict';
import test from 'node:test';
import {
  Bone,
  BufferGeometry,
  Float32BufferAttribute,
  Group,
  MeshBasicMaterial,
  Skeleton,
  SkinnedMesh,
  Uint16BufferAttribute,
  Vector3,
} from 'three';
import { createFootGrounding } from '../src/game/entities/footGrounding';

test('grounding corrects deformed soles under a scaled, rotated parent without moving the root or geometry', (context) => {
  const model = new Group();
  const hips = new Bone();
  hips.position.y = 1;
  const left = new Bone();
  left.name = 'mixamorigLeftFoot';
  left.position.set(-0.15, -1, 0);
  const right = new Bone();
  right.name = 'mixamorigRightFoot';
  right.position.set(0.15, -1, 0);
  hips.add(left, right);
  model.add(hips);

  const positions = [-0.2, 0, -0.1, -0.1, 0, 0.1, 0.1, 0, -0.1, 0.2, 0, 0.1];
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute(
    'skinIndex',
    new Uint16BufferAttribute([1, 0, 0, 0, 1, 0, 0, 0, 2, 0, 0, 0, 2, 0, 0, 0], 4),
  );
  geometry.setAttribute(
    'skinWeight',
    new Float32BufferAttribute([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0], 4),
  );
  const material = new MeshBasicMaterial();
  const mesh = new SkinnedMesh(geometry, material);
  model.add(mesh);
  const skeleton = new Skeleton([hips, left, right]);
  mesh.bind(skeleton);
  context.after(() => {
    geometry.dispose();
    material.dispose();
    skeleton.dispose();
  });

  const parent = new Group();
  parent.position.set(3, 0.2, -2);
  parent.rotation.set(0.08, 0.5, -0.04);
  parent.scale.set(1.1, 1.3, 0.9);
  parent.add(model);
  parent.updateMatrixWorld(true);
  const ground = createFootGrounding(model, hips, left, right);
  assert.ok(ground);
  const rootMatrix = model.matrix.toArray();
  const originalGeometry = Array.from(geometry.getAttribute('position').array);
  const point = new Vector3();
  const soleY = () => {
    parent.updateMatrixWorld(true);
    let minimum = Infinity;
    for (let vertex = 0; vertex < positions.length / 3; vertex++) {
      mesh.getVertexPosition(vertex, point).applyMatrix4(mesh.matrixWorld);
      minimum = Math.min(minimum, point.y);
    }
    return minimum;
  };

  hips.position.y -= 0.3;
  left.rotation.x = right.rotation.x = 0.4;
  assert.ok(soleY() < -0.1, 'The fixture must reproduce below-floor soles.');
  ground(0);
  assert.ok(Math.abs(soleY()) < 1e-6);
  const groundedHips = hips.position.clone();
  ground(0);
  assert.ok(
    hips.position.distanceTo(groundedHips) < 1e-6,
    'Grounding must not accumulate an offset.',
  );
  assert.deepEqual(model.matrix.toArray(), rootMatrix);
  assert.deepEqual(Array.from(geometry.getAttribute('position').array), originalGeometry);
});
