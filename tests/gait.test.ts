import assert from 'node:assert/strict';
import test from 'node:test';
import { Vector3 } from 'three';
import {
  classifyLocomotion,
  createGaitState,
  stepGait,
  type GaitState,
  type GaitTuning,
} from '../src/game/entities/gait';

const tuning: GaitTuning = {
  startSpeed: 0.18,
  stopSpeed: 0.08,
  sector: (50 * Math.PI) / 180,
  sectorMargin: (10 * Math.PI) / 180,
  settleDistance: 0.07,
  settleYaw: 0.6,
  settleDuration: 0.22,
  settleLift: 0.04,
  maxStanceOffset: 0.42,
  minFootGap: 0.16,
  startDistance: 0.12,
};
const ANKLE = 0.09,
  HALF_HIP = 0.12;

interface Run {
  speed: number;
  /** travel direction relative to facing (rad): 0 forward, π backward, π/2 strafe left */
  heading: number;
  stride: number;
  seconds: number;
  rate: number;
  turnRate?: number;
}

/** Drive the gait with a synthetic body and record per-frame foot data. */
function run({ speed, heading, stride, seconds, rate, turnRate = 0 }: Run, state?: GaitState) {
  const gait = state ?? createGaitState();
  const body = new Vector3(0, 0, 0);
  let angle = 0;
  const neutral: [Vector3, Vector3] = [new Vector3(), new Vector3()];
  const frames: {
    planted: boolean[];
    targets: Vector3[];
    lifts: number[];
    angle: number;
    body: Vector3;
    vx: number;
    vz: number;
  }[] = [];
  const dt = 1 / rate;
  for (let i = 0; i < seconds * rate; i++) {
    angle += turnRate * dt;
    const dir = angle + heading;
    const vx = Math.sin(dir) * speed,
      vz = Math.cos(dir) * speed;
    body.x += vx * dt;
    body.z += vz * dt;
    const lx = Math.cos(angle),
      lz = -Math.sin(angle);
    neutral[0].set(body.x + lx * HALF_HIP, ANKLE, body.z + lz * HALF_HIP);
    neutral[1].set(body.x - lx * HALF_HIP, ANKLE, body.z - lz * HALF_HIP);
    stepGait(
      gait,
      {
        dt,
        travelX: vx * dt,
        travelZ: vz * dt,
        velocityX: vx,
        velocityZ: vz,
        angle,
        neutral,
        step: { stride, lift: 0.1 },
        reset: i === 0 && !state,
        bodyX: body.x,
        bodyZ: body.z,
      },
      tuning,
    );
    frames.push({
      planted: gait.feet.map((f) => !f.swinging),
      targets: gait.feet.map((f) => f.target.clone()),
      lifts: gait.feet.map((f) => f.lift),
      angle,
      body: body.clone(),
      vx,
      vz,
    });
  }
  return { gait, frames };
}

for (const rate of [20, 60, 120]) {
  test(`@${rate}Hz forward/backward/strafe: stance feet are world-fixed, feet alternate, never cross, swing goes the travel way`, () => {
    // per-direction strides as calibrated in game-config (× ~1 m leg length)
    for (const [heading, label, stride] of [
      [0, 'forward', 0.6],
      [Math.PI, 'backward', 0.42],
      [Math.PI / 2, 'strafe', 0.36],
      [-Math.PI / 2, 'strafe', 0.36],
    ] as const) {
      const { gait, frames } = run({ speed: 2, heading, stride, seconds: 3, rate });
      assert.equal(gait.locomotion, label, `${label} classification`);
      // ~ one step per stride of travel; a lateral shuffle may add closing steps
      const expected = 6 / stride;
      assert.ok(
        gait.steps >= expected - 2 && gait.steps <= expected * (label === 'strafe' ? 1.4 : 1) + 2,
        `${label}: ${gait.steps} steps for 6 m (stride ${stride})`,
      );
      let swingForwardWhileBackward = 0;
      for (let k = 1; k < frames.length; k++) {
        const a = frames[k - 1],
          b = frames[k];
        assert.ok(!(!b.planted[0] && !b.planted[1]), `${label}: both feet in the air`);
        for (let i = 0; i < 2; i++) {
          if (a.planted[i] && b.planted[i])
            assert.ok(
              a.targets[i].distanceTo(b.targets[i]) < 1e-9,
              `${label}: planted foot ${i} slid`,
            );
          const fx = Math.sin(b.angle),
            fz = Math.cos(b.angle);
          const along =
            (b.targets[i].x - a.targets[i].x) * fx + (b.targets[i].z - a.targets[i].z) * fz;
          if (label === 'backward' && !b.planted[i] && along > 1e-6) swingForwardWhileBackward++;
        }
        // left foot stays on the left of the right foot (facing frame), with spacing
        const lx = Math.cos(b.angle),
          lz = -Math.sin(b.angle);
        const across =
          (b.targets[0].x - b.targets[1].x) * lx + (b.targets[0].z - b.targets[1].z) * lz;
        assert.ok(across > tuning.minFootGap - 1e-6, `${label}: feet crossed (${across})`);
      }
      assert.equal(swingForwardWhileBackward, 0, 'a swing foot moved forward while backpedalling');
      assert.ok(
        frames.some((f) => f.lifts.some((l) => l > 0.09)),
        `${label}: swing foot never lifted`,
      );
    }
  });

  test(`@${rate}Hz stop: feet settle under the body, then no stepping in place; turning in place replants`, () => {
    const moving = run({ speed: 2.2, heading: 0, stride: 0.6, seconds: 1.3, rate });
    const stopped = run({ speed: 0, heading: 0, stride: 0.6, seconds: 1.5, rate }, moving.gait);
    const settledAt = stopped.frames.findIndex(
      (_f, k) => k > 0 && stopped.frames.slice(k).every((g) => g.planted[0] && g.planted[1]),
    );
    assert.ok(settledAt >= 0 && settledAt / rate < 0.8, `settled after ${settledAt / rate}s`);
    const steps = stopped.gait.steps;
    const still = run({ speed: 0, heading: 0, stride: 0.6, seconds: 1, rate }, stopped.gait);
    assert.equal(still.gait.steps, steps, 'stepped in place while idle');
    for (const f of still.frames) assert.ok(f.lifts.every((l) => l === 0));
    // turn 120° in place over 0.8 s: feet must replant toward the new facing
    const turned = run(
      { speed: 0, heading: 0, stride: 0.6, seconds: 1.6, rate, turnRate: (2.1 / 0.8) * 0.5 },
      still.gait,
    );
    assert.ok(turned.gait.steps > steps, 'no replant while turning in place');
  });
}

test('locomotion classification has sector hysteresis', () => {
  const near = (deg: number) => [Math.cos((deg * Math.PI) / 180), Math.sin((deg * Math.PI) / 180)];
  const [f, s] = near(55); // just past the 50° forward sector
  assert.equal(classifyLocomotion(f, s, 'forward', tuning), 'forward');
  assert.equal(classifyLocomotion(f, s, 'idle', tuning), 'strafe');
  const [b1, b2] = near(128);
  assert.equal(classifyLocomotion(b1, b2, 'backward', tuning), 'backward');
  assert.equal(classifyLocomotion(b1, b2, 'strafe', tuning), 'strafe');
});

test('speed hysteresis: hovering between the stop and start speeds does not toggle stepping', () => {
  let state = run({ speed: 0, heading: 0, stride: 0.6, seconds: 0.2, rate: 60 }).gait;
  for (let k = 0; k < 20; k++) {
    state = run(
      { speed: k % 2 ? 0.12 : 0.15, heading: 0, stride: 0.6, seconds: 0.1, rate: 60 },
      state,
    ).gait;
    assert.equal(state.moving, false);
  }
});

test('step counts and settled positions agree across 20/60/120 Hz', () => {
  const results = [20, 60, 120].map((rate) => {
    const a = run({ speed: 1.8, heading: 0.4, stride: 0.55, seconds: 2, rate });
    const b = run({ speed: 0, heading: 0, stride: 0.55, seconds: 1, rate }, a.gait);
    return { steps: a.gait.steps, feet: b.gait.feet.map((f) => f.planted.clone()) };
  });
  for (const r of results) {
    assert.ok(Math.abs(r.steps - results[1].steps) <= 2, `steps ${r.steps} vs ${results[1].steps}`);
    for (let i = 0; i < 2; i++)
      assert.ok(r.feet[i].distanceTo(results[1].feet[i]) < 0.09, 'settled feet diverge by rate');
  }
});

test('low frame rates with fast, short steps (post shuffle at 8–12 Hz, turning) never starve a leg', () => {
  for (const rate of [8, 10, 12]) {
    for (const heading of [Math.PI, Math.PI / 2, 0.7]) {
      const { gait, frames } = run({
        speed: 2.4,
        heading,
        stride: 0.35,
        seconds: 4,
        rate,
        turnRate: 0.9,
      });
      const airborne = [0, 0];
      let worst = 0,
        longestAir = 0;
      for (const f of frames) {
        for (let i = 0; i < 2; i++) {
          const lx = Math.cos(f.angle),
            lz = -Math.sin(f.angle);
          const side = i === 0 ? 1 : -1;
          const nx = f.body.x + lx * HALF_HIP * side,
            nz = f.body.z + lz * HALF_HIP * side;
          if (f.planted[i])
            worst = Math.max(worst, Math.hypot(f.targets[i].x - nx, f.targets[i].z - nz));
          airborne[i] = f.planted[i] ? 0 : airborne[i] + 1;
          longestAir = Math.max(longestAir, airborne[i]);
        }
      }
      const reach = tuning.maxStanceOffset + 2.4 / rate;
      assert.ok(worst <= reach + 1e-6, `@${rate}Hz heading ${heading}: stance offset ${worst}`);
      assert.ok(longestAir <= 3, `@${rate}Hz: a foot stayed airborne ${longestAir} frames`);
      assert.ok(gait.steps > (2.4 * 4 * 0.8) / 0.35, `@${rate}Hz: only ${gait.steps} steps`);
    }
  }
});

test('contact jitter (shoved back and forth ±4 cm while blocked) never starts a walk', () => {
  for (const rate of [20, 60]) {
    const gait = createGaitState();
    const neutral: [Vector3, Vector3] = [new Vector3(), new Vector3()];
    let previous = 0;
    for (let i = 0; i < rate * 3; i++) {
      const t = i / rate;
      const x = 0.04 * Math.sin(t * Math.PI * 2 * 3);
      const v = (x - previous) * rate;
      neutral[0].set(x + HALF_HIP, ANKLE, 0);
      neutral[1].set(x - HALF_HIP, ANKLE, 0);
      stepGait(
        gait,
        {
          dt: 1 / rate,
          travelX: x - previous,
          travelZ: 0,
          velocityX: v,
          velocityZ: 0,
          netSpeed: Math.abs(v),
          angle: 0,
          neutral,
          step: { stride: 0.5, lift: 0.1 },
          reset: i === 0,
          bodyX: x,
          bodyZ: 0,
        },
        tuning,
      );
      previous = x;
      assert.equal(gait.moving, false, `@${rate}Hz started walking at ${t.toFixed(2)} s`);
    }
  }
});
