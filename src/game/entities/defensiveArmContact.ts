import { Bone, Quaternion, Vector3 } from 'three';
import { config, type Legend } from '../data/gameConfig';
import type { DefensiveArmMode } from '../input/defensiveHands';
import type { createArmContact } from './armContact';
import { createDefensiveArmIK, type DefensiveArmLimits } from './defensiveArmIK';
import { palmFrame } from './palmSockets';
import { contactArm } from './locomotion';
import { defensivePushPose } from './defensivePushPose';
import { clamp } from '../utils/math';

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
  let contactSide: -1 | 1 = 1;
  const contactPoint = new Vector3(),
    forearm = new Vector3(),
    segment = new Vector3(),
    toward = new Vector3();
  const debug = {
    selectedArm: 'left' as 'left' | 'right' | 'both',
    virtual: true,
    target: new Vector3(),
    forearm: new Vector3(),
    targetDistance: null as number | null,
    contactValid: false,
    opponentDistance: Infinity,
    phase: 'none' as string,
  };
  return {
    solvers,
    debug,
    get active() {
      return memory.some((m) => m.weight > 0.001);
    },
    update(
      hands: DefensiveArmMode,
      floor: Vector3,
      angle: number,
      opponent: {
        x: number;
        z: number;
        legend: Legend;
        angle?: number;
        y?: number;
        mode?: string;
      } | null,
      dt: number,
      enabled: boolean,
      pushProgress = 0,
      time = 0,
    ) {
      mode = enabled ? hands : 'none';
      yaw.setFromAxisAngle(up, angle);
      left.set(Math.cos(angle), 0, -Math.sin(angle));
      forward.set(Math.sin(angle), 0, Math.cos(angle));
      const push = defensivePushPose(pushProgress);
      if (opponent)
        contactSide = contactArm(
          (opponent.x - floor.x) * left.x + (opponent.z - floor.z) * left.z,
          contactSide,
          config.animation.contactSideDeadzone,
        );
      debug.selectedArm = mode === 'push' ? 'both' : contactSide > 0 ? 'left' : 'right';
      debug.virtual = !opponent;
      debug.contactValid = false;
      debug.targetDistance = null;
      debug.opponentDistance = opponent
        ? Math.hypot(opponent.x - floor.x, opponent.z - floor.z)
        : Infinity;
      debug.phase = mode === 'push' ? push.phase : mode;
      if (opponent) {
        // Closest surface of an oriented torso envelope, in the opponent's actual transform.
        solvers[contactSide > 0 ? 0 : 1].arm.upper.getWorldPosition(shoulder);
        toward.set(shoulder.x - opponent.x, 0, shoulder.z - opponent.z).normalize();
        const yaw = opponent.angle ?? 0;
        const side = toward.x * Math.cos(yaw) - toward.z * Math.sin(yaw);
        const ahead = toward.x * Math.sin(yaw) + toward.z * Math.cos(yaw);
        const radius = config.physics.radius / Math.sqrt((side / 0.95) ** 2 + (ahead / 0.8) ** 2);
        contactPoint
          .set(
            opponent.x,
            (opponent.y ?? config.physics.halfHeight + config.physics.radius) -
              config.physics.halfHeight -
              config.physics.radius +
              config.ballControl[opponent.legend].holdHeight *
                config.defense.hands.braceTorsoHeight -
              (opponent.mode === 'post' ? config.ballControl[opponent.legend].postDrop : 0),
            opponent.z,
          )
          .addScaledVector(toward, radius);
      } else {
        // A local training target has no physical opponent/contact.
        contactPoint
          .copy(floor)
          .addScaledVector(forward, config.physics.radius + solvers[0].foreLength * 0.7);
        solvers[0].arm.upper.getWorldPosition(shoulder);
        contactPoint.y = shoulder.y - solvers[0].upperLength;
      }
      debug.target.copy(contactPoint);
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
        const selected = (i === 0 ? 1 : -1) === contactSide;
        const lateral =
          mode === 'wide' ||
          mode === (i === 0 ? 'left' : 'right') ||
          (mode === 'brace' && !selected);
        const overhead = mode === 'up' || mode === 'wave';
        const contact = (mode === 'brace' && selected) || mode === 'push';
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
            solver.arm.upper.getWorldPosition(shoulder);
            const extension = mode === 'push' ? push.extension : 0;
            // Start from an approximately vertical upper arm and horizontal forearm.
            // Aim at the measured lower torso, with bounded reach and elbow flexion.
            const side = clamp(
              (contactPoint.x - shoulder.x) * left.x + (contactPoint.z - shoulder.z) * left.z,
              -solver.foreLength * 0.35,
              solver.foreLength * 0.35,
            );
            const ahead = clamp(
              (contactPoint.x - shoulder.x) * forward.x +
                (contactPoint.z - shoulder.z) * forward.z +
                solver.foreLength * 0.25,
              solver.foreLength * 0.85,
              solver.foreLength,
            );
            const down = clamp(
              contactPoint.y - shoulder.y,
              -solver.upperLength * 1.1,
              -solver.upperLength * 0.8,
            );
            direction
              .set(side, down, ahead + extension * config.defense.hands.pushReach)
              .normalize();
            const distance = Math.hypot(
              side,
              down,
              ahead + extension * config.defense.hands.pushReach,
            );
            flex = clamp(
              (Math.acos(
                clamp(
                  (distance ** 2 - solver.upperLength ** 2 - solver.foreLength ** 2) /
                    (2 * solver.upperLength * solver.foreLength),
                  -1,
                  1,
                ),
              ) *
                180) /
                Math.PI,
              45,
              105,
            );
            elevation = 0.02 + extension * 0.05;
            normal.set(-sign, 0, 0);
            fingers.set(0, 0, 1);
            pole.set(sign * 0.35, -1, -0.15);
          } else {
            // Open shoulders, hands below the chest; a small asymmetry avoids a rigid guard.
            direction.set(sign * 0.3, -0.48 - i * 0.04, 0.7).normalize();
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
        solver.solve(
          target,
          worldNormal,
          worldFingers,
          worldPole,
          m.weight,
          LIMITS[kind],
          dt,
          contact,
        );
        if (contact && active) {
          // Closest actual forearm point to the torso target, rather than wrist pose labels.
          segment.copy(solver.debug.wrist).sub(solver.debug.elbow);
          const fraction = clamp(
            toward.copy(contactPoint).sub(solver.debug.elbow).dot(segment) /
              Math.max(segment.lengthSq(), 1e-8),
            0,
            1,
          );
          forearm.copy(solver.debug.elbow).addScaledVector(segment, fraction);
          const distance = forearm.distanceTo(contactPoint);
          if (debug.targetDistance === null || distance < debug.targetDistance) {
            debug.targetDistance = distance;
            debug.forearm.copy(forearm);
          }
          debug.contactValid ||=
            !!opponent &&
            debug.opponentDistance <= config.defense.hands.pushRange &&
            distance <= config.defense.hands.forearmContactTolerance &&
            m.weight > 0.8;
        }
      }
    },
  };
}
