import assert from 'node:assert/strict';
import test from 'node:test';
import RAPIER from '@dimforge/rapier3d-compat';
import { config } from '../src/game/data/gameConfig';
import {
  createSmallJump,
  measureJump,
  requestSmallJump,
  stepSmallJump,
} from '../src/game/simulation/smallJump';
import { createDefaultProfile, keyAction, restoreProfile } from '../src/game/input/controlBindings';
import { readGamepadInput } from '../src/game/input/gamepadInput';

test('F and Triangle/Y are configurable jump bindings and legacy Triangle stance migrates without duplicate commands', () => {
  const profile = createDefaultProfile();
  assert.equal(keyAction(profile.defense, 'KeyF'), 'JUMP');
  const buttons = Array.from({ length: 16 }, (_, i) => ({
    value: Number(i === 3),
    pressed: i === 3,
    touched: i === 3,
  }));
  const mapped = readGamepadInput({ axes: [0, 0, 0, 0], buttons }, profile.defense, 0.18);
  assert.equal(mapped.jump, true);
  assert.equal(mapped.q, false);
  const legacy = structuredClone(profile);
  for (const context of ['offense', 'defense'] as const) {
    const bindings: Partial<typeof legacy.offense.gamepad> = legacy[context].gamepad;
    delete bindings.JUMP;
    delete bindings.CHARGE_STANCE;
    legacy[context].gamepad.ACTION_B = { kind: 'button', index: 3 };
  }
  const restored = restoreProfile(legacy);
  assert.deepEqual(restored.defense.gamepad.JUMP, { kind: 'button', index: 3 });
  assert.deepEqual(restored.defense.gamepad.ACTION_B, { kind: 'button', index: 4 });
  assert.deepEqual(restored.defense.gamepad.CHARGE_STANCE, { kind: 'button', index: 1 });
  profile.defense.keyboard.JUMP = ['KeyG'];
  assert.equal(keyAction(restoreProfile(profile).defense, 'KeyG'), 'JUMP');
});

for (const rate of [30, 60, 120])
  test(`@${rate}Hz: Rapier owns takeoff, observed flight and landing; airborne requests never relaunch`, async () => {
    await RAPIER.init();
    const world = new RAPIER.World({ x: 0, y: config.physics.gravity[1], z: 0 });
    world.timestep = 1 / rate;
    world.createCollider(RAPIER.ColliderDesc.cuboid(5, 0.1, 5).setTranslation(0, -0.1, 0));
    const body = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(0, 0.92, 0)
        .setLinearDamping(config.physics.damping)
        .lockRotations(),
    );
    world.createCollider(
      RAPIER.ColliderDesc.capsule(config.physics.halfHeight, config.physics.radius).setMass(150),
      body,
    );
    for (let n = 0; n < rate; n++) world.step();
    const jump = createSmallJump();
    measureJump(jump, body.translation().y, body.linvel().y);
    assert.equal(requestSmallJump(jump, true), true);
    let peak = 0,
      rejected = 0;
    for (let n = 0; n < rate * 2; n++) {
      measureJump(jump, body.translation().y, body.linvel().y);
      if (jump.phase === 'airborne') {
        assert.equal(requestSmallJump(jump, true), false);
        rejected++;
      }
      if (stepSmallJump(jump, 1 / rate, true))
        body.setLinvel({ x: 0, y: config.smallJump.launchSpeed, z: 0 }, true);
      world.step();
      peak = Math.max(peak, body.translation().y - 0.92);
    }
    assert.equal(jump.takeoffs, 1);
    assert.ok(rejected > 0);
    assert.equal(jump.airborneObserved, true);
    assert.ok(peak > 0.12 && peak < 0.4, `measured jump height ${peak}`);
    assert.equal(jump.phase, 'grounded');
    assert.equal(jump.grounded, true);
    assert.equal(requestSmallJump(jump, false), false);
    world.free();
  });
