import assert from 'node:assert/strict';
import test from 'node:test';
import {
  readDefensiveHands,
  hasRaisedDefensiveHands,
  createDefensiveHandInput,
} from '../src/game/input/defensiveHands';
import { defensivePushImpulse } from '../src/game/simulation/defensivePush';
import { createDefensiveArmContact } from '../src/game/entities/defensiveArmContact';
import { createHandContactPose } from '../src/game/entities/handContactPose';
import { config } from '../src/game/data/gameConfig';
import { loadCharacter } from './helpers/loadCharacter';
import { Vector3 } from 'three';
import { createMovementTransform } from '../src/game/simulation/coordinates';
import {
  applyDefensiveArmPose,
  type DefensiveArmPose,
} from '../src/game/entities/defensiveArmPose';

test('held defensive arms use anatomical directions across eight body facings and camera rotations/pitches', () => {
  for (const yaw of [0, 0.6, Math.PI / 2, Math.PI, -1.2])
    for (const pitch of [0.15, 0.4, 1])
      for (let i = 0; i < 8; i++) {
        const facing = (i * Math.PI) / 4;
        const project = (x: number, z: number) => {
          const vector = createMovementTransform(yaw).worldToStick(x, z);
          vector.z *= pitch;
          const length = Math.hypot(vector.x, vector.z);
          return { x: vector.x / length, z: vector.z / length };
        };
        for (const [side, expected] of [
          [1, 'left'],
          [-1, 'right'],
        ] as const) {
          const vector = project(side * Math.cos(facing), -side * Math.sin(facing));
          assert.equal(readDefensiveHands(vector, facing, yaw, pitch), expected);
          assert.equal(
            readDefensiveHands(vector, facing + Math.PI, yaw, pitch, expected),
            expected === 'left' ? 'right' : 'left',
          );
        }
        assert.equal(
          readDefensiveHands(project(Math.sin(facing), Math.cos(facing)), facing, yaw, pitch),
          'up',
        );
        assert.equal(
          readDefensiveHands(project(-Math.sin(facing), -Math.cos(facing)), facing, yaw, pitch),
          'brace',
        );
      }
});

test('two forward flicks wave, held rear braces, and two rear flicks buffer exactly one shove', () => {
  const input = createDefensiveHandInput(config.defense.hands.doubleFlickWindow);
  const sample = (z: number, time: number, enabled = true, version = 0) =>
    input.sample({
      device: 'pad',
      version,
      enabled,
      time,
      vector: { x: 0, z },
      facing: 0,
      cameraAngle: 0,
      verticalScale: 1,
    });
  sample(0, 0);
  assert.equal(sample(-1, 0.1), 'up');
  sample(0, 0.15);
  assert.equal(sample(-1, 0.22), 'wave');
  assert.equal(sample(-1, 1), 'wave', 'second forward hold keeps waving');
  sample(0, 1.1);
  assert.equal(sample(1, 1.2), 'brace');
  assert.equal(sample(1, 1.3), 'brace');
  assert.equal(input.takePush(1.3), null, 'a held first rear never shoves');
  sample(0, 1.35);
  assert.equal(sample(1, 1.4), 'brace');
  assert.ok(input.takePush(1.41));
  assert.equal(input.takePush(1.42), null);
  sample(1, 1.5);
  assert.equal(input.takePush(1.5), null, 'holding cannot repeat the shove');
  sample(0, 1.6);
  sample(-1, 1.7);
  sample(0, 1.8);
  assert.equal(sample(-1, 2.2), 'up', 'late flick is a new ordinary hands-up');
  sample(0, 2.3);
  sample(1, 2.4);
  sample(0, 2.45);
  sample(1, 2.5, false);
  assert.equal(input.takePush(2.51), null, 'pause/possession loss clears pending commands');
  sample(1, 2.6, true, 1);
  assert.equal(input.takePush(2.6), null, 'reset while held cannot produce a shove');
});

test('forearm shove reaches only a nearby opponent ahead and respects relative mass', () => {
  const from = { x: 0, z: 0, angle: 0, mass: 150 };
  const impulse = defensivePushImpulse(from, { x: 0, z: 1, mass: 138 })!;
  assert.equal(impulse.x, 0);
  assert.equal(impulse.z, (config.defense.hands.pushSpeed * 150) / 138);
  assert.equal(defensivePushImpulse(from, { x: 0, z: -1, mass: 138 }), null);
  assert.equal(defensivePushImpulse(from, { x: 1, z: 0, mass: 138 }), null);
  assert.equal(defensivePushImpulse(from, { x: 0, z: 3, mass: 138 }), null);
  const rotated = defensivePushImpulse({ ...from, angle: Math.PI / 2 }, { x: 1, z: 0, mass: 150 })!;
  assert.ok(
    rotated.x > 4 && Math.abs(rotated.z) < 1e-8,
    'the shove follows the body forward direction at impact',
  );
});

for (const legend of ['shaq', 'chuck'] as const) {
  test(`${legend}: lateral palms face forward and checking puts both forearms ahead of the body`, async (context) => {
    const asset = await loadCharacter(legend);
    context.after(asset.dispose);
    const hands = createHandContactPose(asset.model, legend);
    const defense = createDefensiveArmContact(hands.arms, legend);
    const floor = new Vector3();
    for (const mode of ['left', 'right', 'brace'] as const) {
      for (let n = 0; n < 60; n++) {
        asset.reset();
        defense.update(mode, floor, 0, { x: 0, z: 1, legend }, 1 / 60, true);
      }
      const selected = mode === 'brace' ? hands.arms : [hands.arms[mode === 'left' ? 0 : 1]];
      for (const arm of selected) {
        assert.ok(arm.debug.normal.z > 0.85, `${mode} palm faces forward: ${arm.debug.normal.z}`);
        assert.ok(arm.debug.wristBend <= 65.1);
        assert.ok(arm.debug.error < 0.04, `${mode} target reachable: ${arm.debug.error}`);
        if (mode === 'brace') {
          const elbow = arm.fore.getWorldPosition(new Vector3());
          const wrist = arm.hand.getWorldPosition(new Vector3());
          assert.ok(
            elbow.z > 0.15 && wrist.z > 0.3,
            `both forearms extend to the opponent: elbow ${elbow.z}, wrist ${wrist.z}`,
          );
        }
      }
    }
  });
}

test('defensive hands release on neutral, reject invalid input, and distinguish a held pose from a new deflection', () => {
  assert.equal(readDefensiveHands({ x: 0, z: 0 }, 0, 0, 1, 'wave'), 'none');
  assert.equal(readDefensiveHands({ x: 0.4, z: 0 }, 0, 0, 1), 'none');
  assert.equal(readDefensiveHands({ x: 0.4, z: 0 }, 0, 0, 1, 'left'), 'left');
  assert.equal(readDefensiveHands({ x: NaN, z: 1 }, 0, 0, 1, 'up'), 'none');
  assert.equal(readDefensiveHands({ x: 1, z: 0 }, 0, 0, 0, 'right'), 'none');
  assert.equal(hasRaisedDefensiveHands('left'), false);
  assert.equal(hasRaisedDefensiveHands('right'), false);
  assert.equal(hasRaisedDefensiveHands('none'), false);
  assert.equal(hasRaisedDefensiveHands('up'), true);
  assert.equal(hasRaisedDefensiveHands('wave'), true);
});

test('arm poses extend only the requested side and waving moves both raised arms over time', () => {
  const pose: DefensiveArmPose = {
    lDown: 1.3,
    rDown: 1.3,
    lPitch: 0,
    rPitch: 0,
    lElbow: 0.15,
    rElbow: 0.15,
    lIn: 0,
    rIn: 0,
  };
  applyDefensiveArmPose(pose, 'left', 0);
  assert.equal(pose.lDown, 0);
  assert.equal(pose.rDown, 1.3);
  applyDefensiveArmPose(pose, 'right', 0);
  assert.equal(pose.rDown, 0);
  assert.equal(pose.lDown, 1.3);
  applyDefensiveArmPose(pose, 'up', 0);
  assert.ok(pose.lPitch < -2.8 && pose.rPitch < -2.8);
  applyDefensiveArmPose(pose, 'wave', 0.1);
  const left = pose.lDown,
    right = pose.rDown;
  applyDefensiveArmPose(pose, 'wave', 0.3);
  assert.ok(Math.abs(left - pose.lDown) > 0.2);
  assert.ok(Math.abs(right - pose.rDown) > 0.2);
  assert.ok(pose.lPitch < -2.8 && pose.rPitch < -2.8);
});
