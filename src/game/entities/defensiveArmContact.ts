import { Bone, Quaternion, Vector3 } from 'three';
import { config, type Legend } from '../data/gameConfig';
import type { DefensiveArmMode } from '../input/defensiveHands';
import type { createArmContact } from './armContact';
import { createDefensiveArmIK, type DefensiveArmLimits } from './defensiveArmIK';
import { palmFrame } from './palmSockets';

const LIMITS: Record<'extension' | 'guard' | 'contact', DefensiveArmLimits> = {
  extension: { minFlex: 5, maxFlex: 145, maxTwist: 80, maxWrist: 45 },
  guard: { minFlex: 20, maxFlex: 145, maxTwist: 80, maxWrist: 45 },
  contact: { minFlex: 12, maxFlex: 145, maxTwist: 80, maxWrist: 60 },
};

/** Measured wrist-first targets, independent from basketball contact constraints. */
export function createDefensiveArmContact(
  arms: ReturnType<typeof createArmContact>[],
  legend: Legend,
) {
  const solvers = arms.map(createDefensiveArmIK);
  const up = new Vector3(0, 1, 0);
  const overheadFrame = palmFrame(new Vector3(0, 0, 1), up, new Quaternion());
  const memory = solvers.map((solver) => {
    const shoulder = solver.arm.upper.parent;
    if (!(shoulder instanceof Bone) || !/Shoulder$/.test(shoulder.name))
      throw new Error('Defensive arm requires a measured shoulder girdle');
    const rest = shoulder.quaternion.clone();
    const inverseParent = shoulder.parent!.getWorldQuaternion(new Quaternion()).invert();
    const restDirection = solver.arm.upper.position.clone().applyQuaternion(rest).normalize();
    return {
      shoulder,
      rest,
      restDirection,
      up: up.clone().applyQuaternion(inverseParent),
      elevation: 0,
      weight: 0,
      flex: 95,
      initialized: false,
      direction: new Vector3(),
      pole: new Vector3(),
      frame: new Quaternion(),
      socketInverse: solver.arm.socket.quaternion.clone().invert(),
      overheadReach:
        solver.length +
        solver.arm.socket.position
          .clone()
          .applyQuaternion(
            overheadFrame.clone().multiply(solver.arm.socket.quaternion.clone().invert()),
          ).y,
    };
  });
  // Read only through the test seam; no changes to the authored skeleton or skinning.
  const root = arms[0].upper;
  root.userData.defensiveArmContact = {
    legend,
    solvers,
    memory,
    get mode() {
      return mode;
    },
  };
  const left = new Vector3(),
    forward = new Vector3(),
    shoulder = new Vector3();
  const direction = new Vector3(),
    pole = new Vector3(),
    normal = new Vector3(),
    fingers = new Vector3();
  const worldNormal = new Vector3(),
    worldFingers = new Vector3(),
    worldPole = new Vector3();
  const target = new Vector3(),
    desiredClavicle = new Vector3();
  const frame = new Quaternion(),
    yaw = new Quaternion(),
    handWorld = new Quaternion(),
    shoulderRotation = new Quaternion();
  const transform = (local: Vector3, world: Vector3) => world.copy(local).applyQuaternion(yaw);
  let mode: DefensiveArmMode = 'none';
  return {
    solvers,
    get active() {
      return memory.some((m) => m.weight > 0.001);
    },
    update(
      hands: DefensiveArmMode,
      _floor: Vector3,
      angle: number,
      opponent: { x: number; z: number; legend: Legend } | null,
      dt: number,
      enabled: boolean,
      pushProgress = 0,
      time = 0,
    ) {
      mode = enabled ? hands : 'none';
      yaw.setFromAxisAngle(up, angle);
      left.set(Math.cos(angle), 0, -Math.sin(angle));
      forward.set(Math.sin(angle), 0, Math.cos(angle));
      const blend = 1 - Math.exp(-18 * dt);
      for (const [i, solver] of solvers.entries()) {
        const m = memory[i],
          sign = i === 0 ? 1 : -1;
        if (!enabled) {
          // Possession/catching immediately owns the full chain, including clavicle.
          m.weight = 0;
          m.elevation = 0;
          m.initialized = false;
          solver.debug.weight = 0;
          solver.reset();
          continue;
        }
        const active = mode !== 'none';
        m.weight += (Number(active) - m.weight) * blend;
        if (m.weight < 0.001) {
          m.weight = 0;
          m.initialized = false;
          solver.debug.weight = 0;
          continue;
        }
        const lateral = mode === 'wide' || mode === (i === 0 ? 'left' : 'right');
        const overhead = mode === 'up' || mode === 'wave';
        const contact = mode === 'brace' || mode === 'push';
        const kind = lateral || overhead ? 'extension' : contact ? 'contact' : 'guard';
        let flex = 95,
          elevation = 0.04;
        if (active) {
          if (lateral) {
            direction.set(sign, 0, 0.12).normalize();
            flex = 12;
            elevation = 0.1;
            normal.set(0, 0, 1);
            fingers.set(sign, 0, 0);
            pole.set(0, -1, 0.05);
          } else if (overhead) {
            const wave =
              mode === 'wave'
                ? Math.sin(time * config.defense.hands.waveRate * Math.PI * 2 + i * Math.PI)
                : 0;
            direction
              .set(sign * (0.08 + wave * config.defense.hands.waveAmplitude), 1, 0.03)
              .normalize();
            flex = 8 + Math.abs(wave) * 8;
            elevation = 0.35;
            normal.set(0, 0, 1);
            fingers.set(0, 1, 0);
            pole.set(sign, 0, 0.1);
          } else if (contact) {
            // Forearms rise toward contact; distances scale with the actual arm, not character height.
            const extension =
              mode === 'push' ? Math.sin(Math.PI * Math.max(0, Math.min(1, pushProgress))) ** 2 : 0;
            solver.arm.upper.getWorldPosition(shoulder);
            const ahead =
              ((opponent?.x ?? shoulder.x) - shoulder.x) * forward.x +
              ((opponent?.z ?? shoulder.z) - shoulder.z) * forward.z;
            const side =
              ((opponent?.x ?? shoulder.x) - shoulder.x) * left.x +
              ((opponent?.z ?? shoulder.z) - shoulder.z) * left.z;
            const close =
              opponent !== null &&
              ahead > 0 &&
              Math.hypot(opponent.x - shoulder.x, opponent.z - shoulder.z) <=
                config.defense.hands.pushRange;
            direction
              .set(
                -sign * 0.25 + (close ? Math.max(-0.15, Math.min(0.15, side * 0.15)) : 0),
                0.4,
                0.9,
              )
              .normalize();
            flex = 72 - extension * 36;
            elevation = 0.08;
            normal.set(-sign * 0.7, 0, 1).normalize();
            fingers.set(0, 1, 0);
            pole.set(sign * 0.18, -1, -0.15);
          } else {
            // The other arm stays in an upright, inward-facing basketball guard.
            direction.set(-sign * 0.05, -0.2, 0.7).normalize();
            normal.set(-sign, 0, 0.2).normalize();
            fingers.set(0, 0.6, 0.8);
            pole.set(sign * 0.25, -1, -0.1);
          }
          palmFrame(normal, fingers, frame);
          if (!m.initialized) {
            m.direction.copy(direction);
            m.pole.copy(pole);
            m.frame.copy(frame);
            m.flex = flex;
            m.initialized = true;
          } else {
            m.direction.lerp(direction, blend).normalize();
            m.pole.lerp(pole, blend).normalize();
            m.frame.slerp(frame, blend);
            m.flex += (flex - m.flex) * blend;
          }
        }
        m.elevation += ((active ? elevation : 0) - m.elevation) * blend;
        desiredClavicle
          .copy(m.restDirection)
          .multiplyScalar(1 - m.elevation)
          .addScaledVector(m.up, m.elevation)
          .normalize();
        shoulderRotation.setFromUnitVectors(m.restDirection, desiredClavicle).multiply(m.rest);
        m.shoulder.quaternion.copy(shoulderRotation);
        m.shoulder.updateWorldMatrix(true, true);
        solver.arm.upper.getWorldPosition(shoulder);
        transform(m.direction, direction);
        target.copy(shoulder).addScaledVector(direction, solver.reach(m.flex));
        frame.copy(yaw).multiply(m.frame);
        worldNormal.set(0, 0, 1).applyQuaternion(frame);
        worldFingers.set(0, 1, 0).applyQuaternion(frame);
        handWorld.copy(frame).multiply(m.socketInverse);
        target.add(direction.copy(solver.arm.socket.position).applyQuaternion(handWorld));
        transform(m.pole, worldPole);
        solver.solve(target, worldNormal, worldFingers, worldPole, m.weight, LIMITS[kind], dt);
      }
    },
  };
}
