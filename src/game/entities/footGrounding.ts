import { Bone, Matrix3, Matrix4, Object3D, SkinnedMesh, Vector3 } from 'three';

export type FootSide = 'left' | 'right';

/** Foot/toe skin weights select the shoes without depending on asset mesh names. */
export function forEachFootVertex(
  root: Object3D,
  visit: (mesh: SkinnedMesh, vertex: number, side: FootSide) => void,
): void {
  root.traverse((object) => {
    if (!(object instanceof SkinnedMesh)) return;
    const indices = object.geometry.getAttribute('skinIndex');
    const weights = object.geometry.getAttribute('skinWeight');
    const sides = object.skeleton.bones.map((bone) => {
      if (/Left(?:Foot|Toe)/.test(bone.name)) return 'left';
      if (/Right(?:Foot|Toe)/.test(bone.name)) return 'right';
      return null;
    });

    for (let vertex = 0; vertex < indices.count; vertex++) {
      let left = false;
      let right = false;
      for (let component = 0; component < 4; component++) {
        if (weights.getComponent(vertex, component) < 0.05) continue;
        const side = sides[indices.getComponent(vertex, component)];
        left ||= side === 'left';
        right ||= side === 'right';
      }
      if (left) visit(object, vertex, 'left');
      if (right) visit(object, vertex, 'right');
    }
  });
}

/**
 * Capture the authored sole band once, then ground FK poses using cached
 * contact points. The frame loop never scans/skins the character's full mesh.
 * Only the clone's pelvis moves; the rigid body and capsule remain untouched.
 */
export function createFootGrounding(
  model: Object3D,
  hips: Bone | undefined,
  left: Bone | undefined,
  right: Bone | undefined,
  options: { readonly skinnedContacts?: boolean } = {},
): ((floorY: number) => void) | undefined {
  if (!hips || !left || !right) return undefined;
  model.updateMatrixWorld(true);
  const feet = { left, right };
  const samples: Record<FootSide, { mesh: SkinnedMesh; vertex: number; point: Vector3 }[]> = {
    left: [],
    right: [],
  };
  const minimum: Record<FootSide, number> = { left: Infinity, right: Infinity };
  const point = new Vector3();

  forEachFootVertex(model, (mesh, vertex, side) => {
    mesh.getVertexPosition(vertex, point).applyMatrix4(mesh.matrixWorld);
    minimum[side] = Math.min(minimum[side], point.y);
    samples[side].push({ mesh, vertex, point: point.clone() });
  });

  const inverse = new Matrix4();
  const contacts = (['left', 'right'] as const).map((side) => {
    inverse.copy(feet[side].matrixWorld).invert();
    return {
      bone: feet[side],
      // Retain the sole surface, including heel and toe, rather than the ankle joint.
      points: samples[side]
        .filter((sample) => sample.point.y <= minimum[side] + 0.025)
        .map((sample) => ({ ...sample, point: sample.point.applyMatrix4(inverse) })),
    };
  });
  if (contacts.some((contact) => contact.points.length === 0)) return undefined;
  const parentInverse = new Matrix3();

  return (floorY) => {
    let soleY = Infinity;
    for (const contact of contacts) {
      contact.bone.updateWorldMatrix(true, false);
      for (const sample of contact.points) {
        if (options.skinnedContacts) {
          // Toe bones can rotate independently of the ankle in imported clips.
          // Skin the cached sole band; an ankle-only transform can float both shoes.
          sample.mesh.getVertexPosition(sample.vertex, point).applyMatrix4(sample.mesh.matrixWorld);
        } else point.copy(sample.point).applyMatrix4(contact.bone.matrixWorld);
        soleY = Math.min(soleY, point.y);
      }
    }
    // A world-space vertical correction also works beneath scaled/rotated GLB roots.
    parentInverse.setFromMatrix4(hips.parent!.matrixWorld).invert();
    point.set(0, floorY - soleY, 0).applyMatrix3(parentInverse);
    hips.position.add(point);
  };
}
