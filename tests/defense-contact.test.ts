import assert from 'node:assert/strict';
import test from 'node:test';
import { Vector3 } from 'three';
import { loadCharacter } from './helpers/loadCharacter';
import { createHandContactPose } from '../src/game/entities/handContactPose';
import { createDefensiveArmContact } from '../src/game/entities/defensiveArmContact';
import { defensivePushPose } from '../src/game/entities/defensivePushPose';
import {
  measuredForearmGap,
  torsoCenterY,
  defensivePushImpulse,
  type TorsoBody,
  type ForearmContactSample,
} from '../src/game/simulation/defensivePush';
import { config } from '../src/game/data/gameConfig';

test('push has deliberate preparation, short extension and recovery with continuous endpoints', () => {
  const duration = config.defense.hands.pushDuration;
  assert.equal(defensivePushPose(0.1).phase, 'preparation');
  assert.equal(defensivePushPose(0.1).extension, 0);
  assert.equal(defensivePushPose(0.3 / duration).phase, 'extension');
  assert.equal(defensivePushPose(0.6 / duration).phase, 'recovery');
  assert.equal(defensivePushPose(1).extension, 0);
  for (const t of [
    config.defense.hands.pushPreparation,
    config.defense.hands.pushPreparation + config.defense.hands.pushExtension,
  ])
    assert.ok(
      Math.abs(
        defensivePushPose((t - 1e-6) / duration).extension -
          defensivePushPose((t + 1e-6) / duration).extension,
      ) < 1e-6,
    );
});

test('forearm contact follows a current, rotated torso rather than a stale pair of positions', () => {
  const actor = { x: 0, y: 0, z: 0, angle: 0 };
  const opponent = { x: 0, z: 0.85, angle: Math.PI / 2, legend: 'chuck' } satisfies TorsoBody;
  const y = torsoCenterY(opponent);
  const sample: ForearmContactSample = {
    time: 1,
    actor,
    mode: 'push',
    arms: [{ elbow: { x: 0.24, y, z: 0.19 }, wrist: { x: 0.15, y, z: 0.53 } }],
  };
  const gap = measuredForearmGap(sample, 1.1, actor, opponent, 'push');
  assert.ok(gap !== null && gap <= config.defense.hands.forearmContactTolerance);
  assert.equal(
    measuredForearmGap(sample, 1.1, { ...actor, x: 0.2 }, { ...opponent, x: 0.2 }, 'push'),
    gap,
  );
  assert.ok(measuredForearmGap(sample, 1.1, actor, { ...opponent, z: 1.3 }, 'push')! > 0.3);
  assert.ok(measuredForearmGap(sample, 1.1, actor, { ...opponent, y: 1.5 }, 'push')! > 0.3);
  assert.equal(measuredForearmGap(sample, 1.1, { ...actor, x: 3 }, opponent, 'push'), null);
  assert.equal(measuredForearmGap(sample, 1.1, { ...actor, angle: 1 }, opponent, 'push'), null);
  assert.equal(measuredForearmGap(sample, 1.25, actor, opponent, 'push'), null);
  assert.equal(measuredForearmGap(sample, 1.1, actor, opponent, 'brace'), null);
});

test('an angled shove acts along the contact line and still rejects targets behind', () => {
  const actor = { x: 0, z: 0, angle: 0, mass: 150 };
  const target = { x: 0.4, z: 0.8, mass: 138 };
  const impulse = defensivePushImpulse(actor, target);
  assert.ok(impulse && Math.abs(impulse.x / impulse.z - 0.5) < 1e-8);
  assert.equal(defensivePushImpulse(actor, { ...target, z: -0.8 }), null);
});

for (const legend of ['shaq', 'chuck'] as const) {
  test(`${legend}: brace selects the opponent side, covers the other side and keeps virtual training nonphysical`, async (context) => {
    const asset = await loadCharacter(legend);
    context.after(asset.dispose);
    const hands = createHandContactPose(asset.model, legend),
      defense = createDefensiveArmContact(hands.arms, legend);
    for (let f = 0; f < 100; f++) {
      asset.reset();
      defense.update('up', new Vector3(), 0, null, 1 / 60, true);
    }
    for (const side of [-1, 1]) {
      for (let f = 0; f < 100; f++) {
        asset.reset();
        defense.update(
          'brace',
          new Vector3(),
          0,
          { x: side * 0.4, z: 1, angle: Math.PI / 2, legend },
          1 / 60,
          true,
        );
      }
      assert.equal(defense.debug.selectedArm, side > 0 ? 'left' : 'right');
      const selected = defense.solvers[side > 0 ? 0 : 1].debug;
      const opposite = defense.solvers[side > 0 ? 1 : 0].debug;
      assert.ok(selected.elbowFlex > 75 && selected.elbowFlex < 110);
      assert.ok(Math.abs(selected.foreDirection.y) < 0.3);
      assert.ok(opposite.elbowFlex < 18);
      assert.ok(selected.wristBend < 45);
    }
    for (let f = 0; f < 100; f++) {
      asset.reset();
      defense.update('brace', new Vector3(), 0, null, 1 / 60, true);
    }
    assert.equal(defense.debug.virtual, true);
    assert.equal(defense.debug.contactValid, false);
  });
}
