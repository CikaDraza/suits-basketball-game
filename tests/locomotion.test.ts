import assert from 'node:assert/strict';
import test from 'node:test';
import { Bone, Group, Quaternion, Vector3 } from 'three';
import { contactArm, sampleFootstep } from '../src/game/entities/locomotion';
import { createLimbIK } from '../src/game/entities/limbIK';

test('the support foot cancels world translation forwards, backwards and sideways', () => {
  const stride = 0.28;
  for (const direction of [
    { x: 1, z: 0 },
    { x: -1, z: 0 },
    { x: 0, z: -1 },
  ]) {
    const first = sampleFootstep(0.1, stride, 0.065);
    const next = sampleFootstep(0.2, stride, 0.065);
    const distance = 0.1 * 2 * stride;
    assert.equal(first.planted, true);
    assert.equal(next.lift, 0);
    assert.ok(Math.abs((distance + next.travel - first.travel) * direction.x) < 1e-10);
    assert.ok(Math.abs((distance + next.travel - first.travel) * direction.z) < 1e-10);
    assert.ok(sampleFootstep(0.75, stride, 0.065).lift > 0.06);
  }
});

test('the contact arm switches with the defender and retains its side near the spine', () => {
  assert.equal(contactArm(0.8, -1, 0.16), 1);
  assert.equal(contactArm(-0.8, 1, 0.16), -1);
  assert.equal(contactArm(0.05, -1, 0.16), -1);
  assert.equal(contactArm(-0.05, 1, 0.16), 1);
});

test('leg IK reaches backward and lateral steps under a rotated/scaled parent without changing bone lengths or foot orientation', () => {
  const root = new Group();
  root.position.set(3, 0, -2);
  root.rotation.y = 0.7;
  root.scale.setScalar(1.2);
  const thigh = new Bone(),
    shin = new Bone(),
    foot = new Bone();
  thigh.position.set(0.1, 1.3, 0);
  shin.position.set(0, -0.55, 0.12);
  foot.position.set(0, -0.55, -0.12);
  root.add(thigh);
  thigh.add(shin);
  shin.add(foot);
  root.updateMatrixWorld(true);
  const solve = createLimbIK(thigh, shin, foot);
  const hip = thigh.getWorldPosition(new Vector3());
  const knee = shin.getWorldPosition(new Vector3());
  const ankle = foot.getWorldPosition(new Vector3());
  const lengths = [hip.distanceTo(knee), knee.distanceTo(ankle)];
  const orientation = foot.getWorldQuaternion(new Quaternion());
  const forward = new Vector3(Math.sin(0.7), 0, Math.cos(0.7));
  for (const offset of [
    new Vector3(0, 0.12, -0.2),
    new Vector3(0.18, 0.12, 0),
    new Vector3(0, 0.12, 0.2),
  ]) {
    const target = ankle.clone().add(offset);
    solve(target, forward);
    root.updateMatrixWorld(true);
    thigh.getWorldPosition(hip);
    shin.getWorldPosition(knee);
    const actual = foot.getWorldPosition(new Vector3());
    assert.ok(actual.distanceTo(target) < 1e-6);
    assert.ok(Math.abs(hip.distanceTo(knee) - lengths[0]) < 1e-6);
    assert.ok(Math.abs(knee.distanceTo(actual) - lengths[1]) < 1e-6);
    assert.ok(foot.getWorldQuaternion(new Quaternion()).angleTo(orientation) < 1e-6);
    assert.ok(knee.clone().sub(hip).dot(forward) > 0);
  }
});
