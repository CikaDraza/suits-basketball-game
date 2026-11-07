import assert from 'node:assert/strict';
import test from 'node:test';
import RAPIER from '@dimforge/rapier3d-compat';
import { config, level } from '../src/game/data/gameConfig';
import { COURT, HOOP } from '../src/game/court/constants';
import { PLAYER_COLLISION_GROUPS } from '../src/game/physics/ballCollision';
import { createInboundPassController } from '../src/game/simulation/inboundPassController';
import { createDuelState } from '../src/game/simulation/runtime';
import {
  ballisticVelocity,
  crossesDefenderReach,
  planInboundPass,
} from '../src/game/simulation/tacticalPass';

const court = {
  ...level.bounds,
  basket: level.hoop,
  boardX: COURT.BOARD_X,
  boardHalfWidth: HOOP.BOARD_W / 2,
};
const gravity = { x: 0, y: config.physics.gravity[1], z: 0 };
const settings = config.inbound.passing;
const source = level.inbound;
const receiver = { x: 5, y: 0.92, z: 1.5 };
const hands = { ...receiver, y: 1.45 };
const openDefender = { x: 3, y: 0.92, z: -1 };
const frontingDefender = { x: 5.05, y: 0.92, z: 3.4 };
const plan = (target = receiver, palms = hands, guard = openDefender) =>
  planInboundPass(
    source,
    target,
    palms,
    guard,
    config.player.chuck.height,
    gravity,
    court,
    settings,
  );

test('open inbound targets the exact live 3D hands and derives its velocity from that point', () => {
  for (const palms of [hands, { x: 8.1, y: 1.8, z: -2.2 }, { x: 3.1, y: 1.3, z: 3.7 }]) {
    const pass = plan({ ...palms, y: 0.92 }, palms)!;
    assert.equal(pass.type, 'chest');
    assert.deepEqual(pass.target, palms);
    for (const axis of ['x', 'y', 'z'] as const) {
      const destination =
        pass.source[axis] +
        pass.velocity[axis] * pass.duration +
        0.5 * gravity[axis] * pass.duration ** 2;
      assert.ok(Math.abs(destination - palms[axis]) < 1e-10);
    }
  }
  assert.notEqual(
    plan()!.velocity.x,
    plan({ x: 8, y: 0.92, z: 0 }, { x: 8, y: 1.45, z: 0 })!.velocity.x,
  );
});

test('close fronting selects a high lob, while basket-side defense keeps an open lane chest-high', () => {
  const lob = plan(receiver, hands, frontingDefender)!;
  assert.equal(lob.type, 'lob');
  assert.equal(lob.risky, false);
  assert.ok(lob.apex > config.player.chuck.height + settings.lobClearance);
  assert.ok(lob.apex > plan()!.apex + 1);
  assert.deepEqual(lob.aim, hands);
  assert.equal(plan(receiver, hands, { x: 2.8, y: 0.92, z: 0.7 })!.type, 'chest');
  assert.equal(
    plan(receiver, hands, { x: 5.2, y: 0.92, z: 6.5 })!.type,
    'chest',
    'A distant lane defender is not close fronting.',
  );
});

test('only a denied lob in deep paint loses precision toward the physical backboard', () => {
  assert.ok(
    settings.deepPaintRadius >= config.shots.dunkRange,
    'The protected lob area must cover every instant-dunk position.',
  );
  const deep = { x: 1.6, y: 0.92, z: 0 };
  const guard = { x: 2.32, y: 0.92, z: 1.57 };
  const lob = plan(deep, { ...deep, y: 1.45 }, guard)!;
  assert.equal(lob.type, 'lob');
  assert.equal(lob.risky, true);
  assert.deepEqual(lob.target, { ...deep, y: 1.45 });
  assert.ok(lob.aim.x < COURT.BOARD_X);
  assert.ok(lob.aim.y >= HOOP.BOARD_BOTTOM && lob.aim.y <= HOOP.BOARD_BOTTOM + HOOP.BOARD_H);
  assert.equal(plan(deep, { ...deep, y: 1.45 }, { x: 0.5, y: 0.92, z: -1 })!.type, 'chest');
  assert.equal(plan({ x: 4, y: 0.92, z: 8 }, { x: 4, y: 1.45, z: 8 }), null);
});

test('3D sweeps detect a timed crossing between endpoints and reject a ball above reach', () => {
  const from = { x: 0, y: 1.6, z: 0 },
    to = { x: 10, y: 1.6, z: 0 };
  const previous = { x: 5, y: 0.92, z: -1 },
    current = { ...previous, z: 1 };
  assert.equal(crossesDefenderReach(from, to, previous, current, 0.35, 2.3, 0.7), true);
  assert.equal(
    crossesDefenderReach({ ...from, y: 4 }, { ...to, y: 4 }, previous, current, 0.35, 2.3, 0.7),
    false,
  );
  assert.equal(
    crossesDefenderReach(from, to, { ...previous, z: -2 }, { ...current, z: -1.8 }, 0.35, 2.3, 0.7),
    false,
  );
  assert.deepEqual(ballisticVelocity(from, { x: 1, y: 1.6, z: 0 }, 0.5, gravity), {
    x: 2,
    y: 4,
    z: 0,
  });
});

const initialized = RAPIER.init();
async function fixture(target = receiver, guard = openDefender) {
  await initialized;
  const world = new RAPIER.World(gravity);
  world.timestep = 1 / config.physics.timestep;
  const floor = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  floor.userData = { kind: 'floor' };
  world.createCollider(RAPIER.ColliderDesc.cuboid(16, 0.2, 14).setTranslation(7, -0.2, 0), floor);
  const board = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  board.userData = { kind: 'hoop', part: 'backboard' };
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(0.02, HOOP.BOARD_H / 2, HOOP.BOARD_W / 2)
      .setTranslation(COURT.BOARD_X - 0.014, HOOP.BOARD_BOTTOM + HOOP.BOARD_H / 2, 0)
      .setRestitution(0.55),
    board,
  );
  const players = [target, guard].map((position) => {
    const body = world.createRigidBody(
      RAPIER.RigidBodyDesc.fixed().setTranslation(position.x, position.y, position.z),
    );
    world.createCollider(
      RAPIER.ColliderDesc.capsule(
        config.physics.halfHeight,
        config.physics.radius,
      ).setCollisionGroups(PLAYER_COLLISION_GROUPS),
      body,
    );
    return body;
  });
  const ball = world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic().setCcdEnabled(true).setTranslation(source.x, source.y, source.z),
  );
  world.createCollider(
    RAPIER.ColliderDesc.ball(config.ball.radius)
      .setSensor(true)
      .setRestitution(config.physics.ballRestitution),
    ball,
  );
  const runtime = createDuelState(['shaq', 'chuck']);
  runtime.ballState = 'inbound';
  runtime.inboundStage = 'pass';
  runtime.owner = -1;
  let caught = -1;
  const controller = createInboundPassController({
    runtime,
    bodies: { players, ball },
    config,
    court,
    source,
    getHands: (slot) => ({ ...players[slot].translation(), y: 1.45 }),
    onPossession: (slot, intercepted) => {
      caught = slot;
      runtime.owner = slot;
      runtime.ballState = 'held';
      if (intercepted) runtime.interceptions++;
    },
    onMessage: () => {},
    onOutOfBounds: () => {
      runtime.ballState = 'inbound';
    },
  });
  function step(count = 1) {
    for (let index = 0; index < count; index++) {
      runtime.time += world.timestep;
      world.step();
      controller.afterPhysicsStep(world);
    }
  }
  return {
    world,
    players,
    ball,
    runtime,
    controller,
    step,
    get caught() {
      return caught;
    },
  };
}

test('Rapier carries an open chest pass to the hands without per-step translation writes', async () => {
  const game = await fixture();
  try {
    game.players[0].setTranslation({ x: 7, y: 0.92, z: 1 }, true);
    assert.equal(game.controller.launch(0), true);
    assert.deepEqual(game.runtime.inboundPass!.target, { x: 7, y: 1.45, z: 1 });
    assert.equal(game.ball.collider(0).isSensor(), false);
    assert.ok(game.ball.linvel().z < 0);
    for (let step = 0; step < 120 && game.runtime.ballState === 'pass'; step++) game.step();
    assert.equal(game.caught, 0);
    assert.equal(game.runtime.inboundPass!.outcome, 'caught');
    assert.equal(game.runtime.inboundPass!.type, 'chest');
  } finally {
    game.world.free();
  }
});

test('a normal lob clears a fronting defender and remains catchable', async () => {
  const game = await fixture(receiver, frontingDefender);
  try {
    game.runtime.players[1].prevR = true;
    game.runtime.players[1].interceptUntil = 10;
    game.controller.launch(0);
    let height = 0;
    for (let step = 0; step < 180 && game.runtime.ballState === 'pass'; step++) {
      game.step();
      height = Math.max(height, game.ball.translation().y);
    }
    assert.ok(height > 3.5);
    assert.equal(game.runtime.inboundPass!.type, 'lob');
    assert.equal(game.runtime.inboundPass!.risky, false);
    assert.equal(game.caught, 0);
  } finally {
    game.world.free();
  }
});

test('a deep-paint lob physically rebounds off the Rapier board and cannot auto-catch or score', async () => {
  const game = await fixture({ x: 1.6, y: 0.92, z: 0 }, { x: 2.32, y: 0.92, z: 1.57 });
  try {
    game.controller.launch(0);
    assert.equal(game.runtime.inboundPass!.risky, true);
    for (let step = 0; step < 180 && game.runtime.ballState === 'pass'; step++) game.step();
    assert.equal(game.runtime.inboundPass!.contact, 'backboard');
    assert.equal(game.runtime.inboundPass!.outcome, 'deflected');
    assert.equal(game.runtime.ballState, 'loose');
    assert.ok(game.ball.linvel().x > 0, 'The contact solver must reverse the inbound X velocity.');
    assert.equal(game.caught, -1);
    assert.deepEqual(game.runtime.score, [0, 0]);
  } finally {
    game.world.free();
  }
});

for (const attempt of ['timed', 'none', 'expired'] as const) {
  test(`a crossing defender ${attempt === 'timed' ? 'intercepts with R' : 'cannot intercept with ' + attempt + ' R'}`, async () => {
    const game = await fixture();
    try {
      game.controller.launch(0);
      game.players[1].setTranslation({ x: 5.1, y: 0.92, z: 4 }, true);
      game.runtime.players[1].prevR = attempt !== 'none';
      game.runtime.players[1].interceptUntil = attempt === 'timed' ? 0.25 : -1;
      for (let step = 0; step < 180 && game.runtime.ballState === 'pass'; step++) game.step();
      assert.equal(game.caught, attempt === 'timed' ? 1 : 0);
      assert.equal(game.runtime.interceptions, attempt === 'timed' ? 1 : 0);
    } finally {
      game.world.free();
    }
  });
}

test('a receiver cutting into dunk range after a safe lob launch cannot obtain an automatic catch', async () => {
  const game = await fixture({ x: 3.9, y: 0.92, z: 0 }, { x: 4.2, y: 0.92, z: 1.7 });
  try {
    game.controller.launch(0);
    assert.equal(game.runtime.inboundPass!.type, 'lob');
    assert.equal(game.runtime.inboundPass!.risky, false);
    // The new position is still inside catchRadius of the original target, but inside dunk range.
    game.players[0].setTranslation({ x: 3.4, y: 0.92, z: 0 }, true);
    for (let step = 0; step < 180 && game.runtime.ballState === 'pass'; step++) game.step();
    assert.equal(game.runtime.inboundPass!.risky, true);
    assert.notEqual(game.runtime.inboundPass!.outcome, 'caught');
    assert.equal(game.caught, -1);
    assert.deepEqual(game.runtime.score, [0, 0]);
  } finally {
    game.world.free();
  }
});
