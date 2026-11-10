import assert from 'node:assert/strict';
import test from 'node:test';
import { Quaternion, Vector3 } from 'three';
import { createDefensiveArmContact } from '../src/game/entities/defensiveArmContact';
import { createHandContactPose } from '../src/game/entities/handContactPose';
import { createImportedWalk } from '../src/game/entities/importedWalk';
import { readDefensiveArms } from '../src/game/harness/characterPose';
import { loadCharacter } from './helpers/loadCharacter';

for (const legend of ['shaq', 'chuck'] as const) {
  test(`${legend}: measured defensive poses preserve anatomical planes, guarding arm and overhead reach`, async (context) => {
    const asset = await loadCharacter(legend);
    context.after(asset.dispose);
    const contacts = createHandContactPose(asset.model, legend);
    const defense = createDefensiveArmContact(contacts.arms, legend);
    const floor = new Vector3(),
      opponent = { x: 0, z: 1, legend };
    for (const mode of ['ready', 'wide', 'left', 'right', 'up', 'brace', 'push'] as const) {
      for (let f = 0; f < 100; f++) {
        asset.reset();
        defense.update(mode, floor, 0, opponent, 1 / 60, true, 0.5);
      }
      for (const [i, d] of readDefensiveArms(asset.model).entries()) {
        const arm = contacts.arms[i],
          palm = arm.debug.palm;
        const shoulder = new Vector3().copy(d.shoulder),
          elbow = new Vector3().copy(d.elbow),
          wrist = new Vector3().copy(d.wrist);
        assert.ok(d.elbowPlaneError < 0.1, `${mode} ${i}: elbow plane ${d.elbowPlaneError}`);
        assert.ok(Math.abs(shoulder.distanceTo(elbow) - d.upperLength) < 1e-5);
        assert.ok(Math.abs(elbow.distanceTo(wrist) - d.foreLength) < 1e-5);
        assert.ok(d.contactError < 0.005, `${mode} ${i}: contact ${d.contactError}`);
        assert.ok(
          d.wristBend < (mode === 'push' ? 59.9 : 44.9),
          `${mode} ${i}: wrist limit saturated ${d.wristBend}`,
        );
        assert.ok(Math.abs(d.forearmTwist) < 79, `${mode} ${i}: forearm limit saturated`);
        const lateral = mode === 'wide' || mode === (i === 0 ? 'left' : 'right');
        if (lateral) {
          assert.ok(d.elbowFlex > 7 && d.elbowFlex < 16, `${mode} ${i}: ${d.elbowFlex}°`);
          assert.ok(Math.abs(wrist.x - shoulder.x) > (d.upperLength + d.foreLength) * 0.97);
          assert.ok(arm.debug.normal.z > 0.97);
        } else if (mode === 'up') {
          const head = asset.bones.Head.getWorldPosition(new Vector3());
          assert.ok(
            palm.y > head.y + 0.4,
            `${legend}: hands should reach above head: ${palm.y} / ${head.y}`,
          );
          assert.ok((palm.y - shoulder.y) / (d.maximumOverheadPalmY - shoulder.y) > 0.98);
          assert.ok(d.elbowFlex > 5 && d.elbowFlex < 12);
        } else if (mode === 'ready' || mode === 'left' || mode === 'right') {
          assert.ok(wrist.z - shoulder.z > (d.upperLength + d.foreLength) * 0.5);
          assert.ok(wrist.y > elbow.y + (d.upperLength + d.foreLength) * 0.15);
          assert.ok(wrist.y < shoulder.y + 0.05, 'guard stays in front of the upper torso');
          assert.ok(d.elbowFlex > 85 && d.elbowFlex < 105);
        } else if (mode === 'brace' || mode === 'push') {
          assert.ok(wrist.z > elbow.z && elbow.z > shoulder.z);
          assert.ok(wrist.y > elbow.y);
          assert.ok(arm.debug.normal.z > 0.75);
        }
      }
    }
  });

  test(`${legend}: transitions and release stay continuous; ball ownership clears defensive layer`, async (context) => {
    const asset = await loadCharacter(legend);
    context.after(asset.dispose);
    const contacts = createHandContactPose(asset.model, legend);
    const defense = createDefensiveArmContact(contacts.arms, legend);
    const floor = new Vector3(),
      opponent = { x: 0, z: 1, legend };
    const bones = contacts.arms.flatMap((a) => [a.upper.parent!, a.upper, a.fore, a.hand]);
    let previous: Quaternion[] | undefined;
    for (const mode of ['ready', 'left', 'right', 'up', 'wide', 'brace', 'none'] as const) {
      for (let frame = 0; frame < 100; frame++) {
        asset.reset();
        defense.update(mode, floor, 0, opponent, 1 / 60, true);
        const current = bones.map((b) => b.quaternion.clone());
        if (previous)
          current.forEach((q, i) =>
            assert.ok(
              q.angleTo(previous![i]) < 0.65,
              `${mode} frame ${frame} joint ${i}: sudden rotation ${q.angleTo(previous![i])}`,
            ),
          );
        previous = current;
      }
    }
    asset.reset();
    const expected = bones.map((b) => b.quaternion.clone());
    defense.update('up', floor, 0, opponent, 1 / 60, false);
    bones.forEach((bone, i) => assert.ok(bone.quaternion.equals(expected[i])));
    assert.ok(!defense.active);
  });
}

test('imported walking leaves an owned defensive shoulder and arm chain untouched', async (context) => {
  const asset = await loadCharacter('shaq');
  context.after(asset.dispose);
  const contacts = createHandContactPose(asset.model, 'shaq');
  const defense = createDefensiveArmContact(contacts.arms, 'shaq');
  const walk = createImportedWalk(asset.model, asset.clips);
  for (let frame = 0; frame < 100; frame++) {
    asset.reset();
    walk.step(1 / 60, 0.02, true, false);
    walk.apply(false);
    defense.update('up', new Vector3(), 0, { x: 0, z: 1, legend: 'chuck' }, 1 / 60, true);
    if (frame > 35)
      for (const arm of contacts.arms)
        assert.ok(arm.debug.palm.y > asset.bones.Head.getWorldPosition(new Vector3()).y + 0.35);
  }
  const before = contacts.arms.map((a) => a.debug.palm.y);
  walk.apply(false);
  contacts.arms.forEach((a, i) =>
    assert.ok(Math.abs(a.socket.getWorldPosition(new Vector3()).y - before[i]) < 1e-5),
  );
  assert.ok(walk.debug.applied > 0, 'leg animation remains active');
});
