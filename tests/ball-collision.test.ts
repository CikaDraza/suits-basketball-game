import assert from 'node:assert/strict';
import test from 'node:test';
import RAPIER from '@dimforge/rapier3d-compat';
import type { RapierRigidBody } from '@react-three/rapier';
import { config } from '../src/game/data/gameConfig';
import { PLAYER_COLLISION_GROUPS, syncBallCollision } from '../src/game/physics/ballCollision';

/*
 * A ball that becomes free (fumble/steal/missed catch) where the hands held it is inside the
 * holder's capsule (hold point 0.29–0.32 m < 0.42 m radius); as a solid body it must start
 * outside, or Rapier's depenetration launches the 140 kg capsule. (The held-ball push itself
 * only reproduces through @react-three/rapier and is covered in tests/browser/locomotion.)
 */
const initialized = RAPIER.init();
const REST_Y = config.physics.halfHeight + config.physics.radius;

async function world() {
  await initialized;
  const w = new RAPIER.World({ x: 0, y: config.physics.gravity[1], z: 0 });
  w.timestep = 1 / config.physics.timestep;
  const floor = w.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  w.createCollider(RAPIER.ColliderDesc.cuboid(16, 0.2, 14).setTranslation(7, -0.2, 0), floor);
  const player = w.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(5, REST_Y, 3.5)
      .lockRotations()
      .setLinearDamping(config.physics.damping),
  );
  w.createCollider(
    RAPIER.ColliderDesc.capsule(config.physics.halfHeight, config.physics.radius)
      .setMass(150)
      .setFriction(0)
      .setCollisionGroups(PLAYER_COLLISION_GROUPS),
    player,
  );
  const ball = w.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic().setCcdEnabled(true).setTranslation(5, 1.5, 3.8),
  );
  w.createCollider(RAPIER.ColliderDesc.ball(config.ball.radius).setSensor(true), ball);
  return { w, player, ball: ball as unknown as RapierRigidBody };
}

test('a ball that becomes loose inside a capsule starts clear of it and launches nobody', async () => {
  for (const y of [0.14, 1.2]) {
    const { w, player, ball } = await world();
    syncBallCollision(ball, 'held');
    ball.setTranslation({ x: 5, y, z: 3.5 }, true); // dead centre of the capsule
    syncBallCollision(ball, 'loose', {
      players: [player as unknown as RapierRigidBody],
      halfHeight: config.physics.halfHeight,
      radius: config.physics.radius,
      ballRadius: config.ball.radius,
    });
    const b = ball.translation();
    const clearance = Math.hypot(b.x - 5, b.z - 3.5);
    assert.ok(
      clearance >= config.physics.radius + config.ball.radius,
      `ball still inside (${clearance})`,
    );
    let highest = 0;
    for (let step = 0; step < 90; step++) {
      w.step();
      highest = Math.max(highest, player.translation().y);
    }
    assert.ok(highest < REST_Y + 0.05, `ball at y=${y} launched the player to ${highest}`);
    w.free();
  }
});
