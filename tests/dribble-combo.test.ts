import assert from 'node:assert/strict';
import test from 'node:test';
import { Vector3 } from 'three';
import { config, type Legend } from '../src/game/data/gameConfig';
import {
  cancelDribbleSkill,
  createBallHandlingState,
  protectedBallTarget,
  requestDribbleSkill,
  stepBallHandling,
  type DribbleSkill,
  type DribbleSkillRequest,
} from '../src/game/simulation/ballHandling';
import { createHandContactPose } from '../src/game/entities/handContactPose';
import { loadCharacter } from './helpers/loadCharacter';

const BODY_Y = config.physics.halfHeight + config.physics.radius;

function makeDribble(legend: Legend, hand: number, rate = 60) {
  const state = createBallHandlingState();
  const body = { x: 0, y: BODY_Y, z: 0 };
  let current = protectedBallTarget(legend, body, 0, false, { x: 0, y: 0, z: 0 });
  const step = (angle = 0) => {
    current = {
      ...stepBallHandling(
        state,
        0,
        legend,
        body,
        angle,
        'dribble',
        state.owner < 0 ? hand : state.hand,
        false,
        0,
        current,
        1 / rate,
      ),
    };
    return current;
  };
  for (let n = 0; n < rate; n++) step();
  return { state, body, step, current: () => current };
}

for (const legend of ['shaq', 'chuck'] as const)
  for (const initialHand of [1, -1] as const)
    for (const rate of [20, 30, 60, 120])
      test(`${legend} hand ${initialHand} @${rate} Hz: all moves have exact bounce/transfer counts and continuous paths`, () => {
        const cases: { request: DribbleSkillRequest; bounces: number; transfers: number }[] = [
          { request: { kind: 'side', hand: initialHand }, bounces: 2, transfers: 0 },
          { request: { kind: 'side', hand: -initialHand as 1 | -1 }, bounces: 1, transfers: 1 },
          { request: { kind: 'front', hand: initialHand }, bounces: 3, transfers: 3 },
          { request: { kind: 'behind', hand: initialHand }, bounces: 1, transfers: 1 },
          {
            request: { kind: 'behind', hand: initialHand, double: true },
            bounces: 3,
            transfers: 3,
          },
        ];
        for (const { request, bounces, transfers } of cases) {
          const dribble = makeDribble(legend, initialHand, rate);
          assert.equal(requestDribbleSkill(dribble.state, request, initialHand), true);
          const hands: number[] = [];
          let floors = 0,
            maxSpeed = 0,
            minZ = Infinity,
            maxOutward = 0,
            activeTime = 0;
          for (let n = 0; n < rate * 3 && dribble.state.skill; n++) {
            const previous = { ...dribble.current() };
            const wasStarted = dribble.state.skill?.started;
            const previousHand = dribble.state.hand;
            const point = dribble.step();
            if (!wasStarted && !dribble.state.skill?.started) continue;
            if (wasStarted) activeTime += 1 / rate;
            if (dribble.state.floorEvent) floors++;
            if (dribble.state.hand !== previousHand) hands.push(dribble.state.hand);
            maxSpeed = Math.max(
              maxSpeed,
              Math.hypot(point.x - previous.x, point.y - previous.y, point.z - previous.z) * rate,
            );
            minZ = Math.min(minZ, dribble.state.local.z);
            maxOutward = Math.max(maxOutward, initialHand * dribble.state.local.x);
            assert.ok(point.y >= config.ball.radius - 1e-9, 'ball never goes below the floor');
          }
          assert.equal(dribble.state.skill, null, 'combination finishes');
          assert.equal(floors, bounces, 'one actual floor bounce per planned beat');
          assert.equal(hands.length, transfers);
          assert.deepEqual(
            hands,
            Array.from({ length: transfers }, (_, i) => initialHand * (i % 2 ? 1 : -1)),
          );
          assert.equal(dribble.state.hand, transfers % 2 ? -initialHand : initialHand);
          assert.ok(
            activeTime <= bounces * config.ballControl.skills.period + 1 / rate + 1e-8,
            'the combination uses quick bounces',
          );
          assert.ok(maxSpeed < 26, `bounded continuous ball speed ${maxSpeed}`);
          if (request.kind === 'behind')
            assert.ok(minZ < -0.4, 'ball genuinely crosses behind the body');
          if (request.kind === 'front') assert.ok(minZ > 0.2, 'front combination stays in front');
          if (request.kind === 'side' && transfers === 0)
            assert.ok(
              maxOutward > config.ballControl[legend].hipSide + 0.14,
              'both bounces reach outward',
            );
          const finalHand = dribble.state.hand;
          for (let n = 0; n < rate; n++) dribble.step();
          assert.equal(
            dribble.state.hand,
            finalHand,
            'the normal dribble retains the finishing hand',
          );
        }
      });

test('a second rear flick upgrades the in-progress single rear crossover to exactly three transfers', () => {
  const dribble = makeDribble('shaq', 1);
  assert.ok(requestDribbleSkill(dribble.state, { kind: 'behind', hand: 1 }, 1));
  while (!dribble.state.skill?.started) dribble.step();
  for (let n = 0; n < 8; n++) dribble.step();
  assert.equal(dribble.state.hand, -1, 'the first transfer already happened');
  assert.equal(requestDribbleSkill(dribble.state, { kind: 'front', hand: -1 }, -1), false);
  assert.equal(
    requestDribbleSkill(dribble.state, { kind: 'behind', hand: -1, double: true }, -1),
    true,
  );
  assert.equal(dribble.state.skill!.initialHand, 1, 'the combo retains the original starting hand');
  assert.equal(dribble.state.skill!.total, 3);
  assert.equal(
    requestDribbleSkill(dribble.state, { kind: 'behind', hand: -1, double: true }, -1),
    false,
  );
  const hands: number[] = [];
  while (dribble.state.skill) {
    const before: number = dribble.state.hand;
    dribble.step();
    if (dribble.state.hand !== before) hands.push(dribble.state.hand);
  }
  assert.deepEqual(hands, [1, -1]);
});

test('a queued move survives the chest-hold entry and cancellation removes every pending transfer', () => {
  const state = createBallHandlingState();
  const body = { x: 0, y: BODY_Y, z: 0 };
  const current = protectedBallTarget('chuck', body, 0, false, { x: 0, y: 0, z: 0 });
  assert.ok(requestDribbleSkill(state, { kind: 'front', hand: 1 }, 1));
  stepBallHandling(state, 0, 'chuck', body, 0, 'dribble', 1, false, 0, current, 1 / 60);
  assert.equal(state.skill?.started, true);
  cancelDribbleSkill(state);
  assert.equal(state.skill, null);
  assert.equal(state.crossing, false);
});

test('a rear double flick after the first quick transfer finishes adds only the two remaining transfers', () => {
  const dribble = makeDribble('chuck', 1);
  requestDribbleSkill(dribble.state, { kind: 'behind', hand: 1 }, 1);
  const original = dribble.state.skill;
  while (dribble.state.skill) dribble.step();
  assert.equal(dribble.state.hand, -1);
  assert.equal(dribble.state.lastSkill?.total, 1);
  requestDribbleSkill(dribble.state, { kind: 'behind', hand: -1, double: true }, -1);
  const resumed = dribble.state.skill as DribbleSkill | null;
  assert.equal(resumed, original, 'late extension retains the same movement-risk identity');
  assert.equal(resumed?.started, true, 'late extension resumes the quick period immediately');
  assert.equal(resumed?.completed, 1);
  assert.equal(resumed?.initialHand, 1);
  const hands: number[] = [];
  let frames = 0;
  while (dribble.state.skill) {
    const before: number = dribble.state.hand;
    dribble.step();
    frames++;
    if (dribble.state.hand !== before) hands.push(dribble.state.hand);
  }
  assert.deepEqual(hands, [1, -1]);
  assert.ok(frames / 60 <= 2 * config.ballControl.skills.period + 1 / 60);
});

for (const legend of ['shaq', 'chuck'] as const)
  for (const rate of [20, 30, 60, 120])
    test(`${legend} @${rate} Hz: every quick floor event touches the court when starting from a chest hold`, () => {
      const state = createBallHandlingState();
      const body = { x: 0, y: BODY_Y, z: 0 };
      let current = protectedBallTarget(legend, body, 0, false, { x: 0, y: 0, z: 0 });
      requestDribbleSkill(state, { kind: 'side', hand: 1 }, 1);
      const dt = 1 / rate;
      let contacts = 0;
      for (let n = 0; n < rate && state.skill; n++) {
        current = {
          ...stepBallHandling(
            state,
            0,
            legend,
            body,
            0,
            'dribble',
            state.hand,
            false,
            0,
            current,
            dt,
          ),
        };
        if (!state.floorEvent) continue;
        contacts++;
        assert.ok(Math.abs(state.phase - 0.5) < 1e-10);
        assert.ok(
          Math.abs(current.y - config.ball.radius) < 1e-10,
          'entry interpolation cannot hold a free bounce above the court',
        );
      }
      assert.equal(contacts, 2);
    });

for (const legend of ['shaq', 'chuck'] as const)
  for (const rate of [20, 30, 60, 120])
    test(`${legend} @${rate} Hz: real palms release and catch quick front/behind combinations while the body turns`, async (context) => {
      const asset = await loadCharacter(legend);
      context.after(asset.dispose);
      for (const kind of ['side', 'front', 'behind'] as const)
        for (const initialHand of [1, -1] as const) {
          asset.reset();
          const pose = createHandContactPose(asset.model, legend);
          const dribble = makeDribble(legend, initialHand, rate);
          const floor = new Vector3(),
            ball = new Vector3(),
            toBall = new Vector3();
          requestDribbleSkill(
            dribble.state,
            { kind, hand: initialHand, double: kind === 'behind' },
            initialHand,
          );
          let catches = 0,
            releases = 0;
          for (let frame = 0; frame < rate * 3; frame++) {
            const angle = frame / (rate * 2);
            dribble.body.x += 0.12 / rate;
            const current = dribble.step(angle);
            asset.reset();
            pose.reset();
            asset.model.position.set(dribble.body.x, 0, 0);
            asset.model.rotation.set(0, angle, 0);
            asset.model.updateMatrixWorld(true);
            floor.set(dribble.body.x, 0, 0);
            ball.set(current.x, current.y, current.z);
            pose.update(ball, true, false, true, dribble.state, floor, angle, 1 / rate);
            if (!dribble.state.skill?.started || frame < rate / 3) continue;
            const active = pose.arms[dribble.state.hand === 1 ? 0 : 1].debug;
            if (dribble.state.phase > 0.93 || dribble.state.phase < 0.07) {
              catches++;
              assert.ok(
                Math.abs(active.palm.distanceTo(ball) - config.ball.radius) < 0.04,
                `${kind} catch gap ${Math.abs(active.palm.distanceTo(ball) - config.ball.radius)}`,
              );
              assert.ok(toBall.copy(ball).sub(active.palm).normalize().dot(active.normal) > 0.85);
            }
            if (dribble.state.phase > 0.35 && dribble.state.phase < 0.65) {
              releases++;
              assert.ok(
                active.palm.distanceTo(ball) > config.ball.radius + 0.1,
                'the hand stays up while the ball crosses freely near the floor',
              );
            }
            assert.ok(active.wristBend <= 65.1);
          }
          assert.ok(catches > 0, `${kind} has measured catch frames`);
          assert.ok(releases > 0, `${kind} has measured free ball frames`);
        }
    });

for (const legend of ['shaq', 'chuck'] as const)
  test(`${legend}: quick crossover recovery remains reachable when the rendered ball lags physics`, async (context) => {
    const asset = await loadCharacter(legend);
    context.after(asset.dispose);
    const floor = new Vector3(),
      ball = new Vector3();
    const body = { x: 0, y: 0.91877, z: 0 };
    for (const renderRate of [10, 15, 20, 30, 60]) {
      asset.reset();
      const pose = createHandContactPose(asset.model, legend);
      const state = createBallHandlingState();
      let current = { x: 0.43, y: 1.2, z: 0.24 };
      let measuredRecoveries = 0;
      for (let frame = 0; frame < 60 * 5; frame++) {
        if (frame === 90 || frame === 210)
          requestDribbleSkill(state, { kind: 'side', hand: frame === 90 ? -1 : 1 }, state.hand);
        // Rapier's display interpolation can show the preceding fixed-step
        // ball while the hand renderer sees the latest authoritative phase.
        const displayed = { ...current };
        current = {
          ...stepBallHandling(
            state,
            0,
            legend,
            body,
            0,
            'dribble',
            state.hand,
            false,
            0,
            current,
            1 / 60,
          ),
        };
        if (frame % (60 / renderRate)) continue;
        asset.reset();
        pose.reset();
        asset.model.position.set(0, -0.02, 0);
        asset.model.updateMatrixWorld(true);
        ball.set(displayed.x, displayed.y, displayed.z);
        pose.update(ball, true, false, true, state, floor, 0, 1 / renderRate);
        if (!state.skill?.started || state.phase < 0.5 || state.phase > 0.95) continue;
        const active = pose.arms[state.hand === 1 ? 0 : 1].debug;
        if (active.weight < 0.98) continue;
        measuredRecoveries++;
        assert.ok(
          active.error < 0.025,
          `${legend} physics60/render${renderRate} phase${state.phase}: recovery palm error ${active.error}`,
        );
        assert.ok(active.wristBend <= 65.02);
      }
      assert.ok(measuredRecoveries > 0, `measured active recovery at ${renderRate}Hz`);
    }
  });
