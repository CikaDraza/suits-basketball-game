import { Vector3 } from 'three';
import { config, type Legend } from '../data/gameConfig';
import type { DefensiveHands } from '../input/defensiveHands';
import type { createArmContact } from './armContact';

/** Anatomical arm IK: palms face forward for an open embrace and two-forearm checking. */
export function createDefensiveArmContact(
  arms: ReturnType<typeof createArmContact>[],
  legend: Legend,
) {
  const point = new Vector3(),
    elbow = new Vector3(),
    wrist = new Vector3();
  const spans = arms.map((arm) => {
    arm.upper.getWorldPosition(point);
    arm.fore.getWorldPosition(elbow);
    arm.hand.getWorldPosition(wrist);
    return point.distanceTo(elbow) + elbow.distanceTo(wrist);
  });
  const localTargets = [new Vector3(), new Vector3()];
  const weights = [0, 0];
  const left = new Vector3(),
    forward = new Vector3(),
    target = new Vector3();
  const normal = new Vector3(),
    fingers = new Vector3(),
    pole = new Vector3(),
    shoulder = new Vector3();
  return {
    update(
      hands: DefensiveHands,
      floor: Vector3,
      angle: number,
      opponent: { x: number; z: number; legend: Legend },
      dt: number,
      enabled: boolean,
      pushProgress = 0,
    ) {
      left.set(Math.cos(angle), 0, -Math.sin(angle));
      forward.set(Math.sin(angle), 0, Math.cos(angle));
      for (let i = 0; i < arms.length; i++) {
        if (!enabled) {
          weights[i] = 0;
          continue;
        }
        const sign = i === 0 ? 1 : -1;
        const brace = hands === 'brace' || hands === 'push';
        const active = brace || (i === 0 ? hands === 'left' : hands === 'right');
        weights[i] += (Number(active) - weights[i]) * (1 - Math.exp(-20 * dt));
        const local = localTargets[i];
        if (active) {
          arms[i].upper.getWorldPosition(shoulder);
          point.copy(shoulder).sub(floor);
          const sx = point.dot(left),
            sz = point.dot(forward);
          if (brace) {
            const dx = opponent.x - floor.x,
              dz = opponent.z - floor.z;
            const ahead = dx * forward.x + dz * forward.z;
            const side = dx * left.x + dz * left.z;
            const touching = ahead > 0 && Math.hypot(dx, dz) <= config.defense.hands.pushRange;
            const extension = hands === 'push' ? Math.sin(Math.PI * pushProgress) ** 2 : 0;
            local.set(
              sign * config.player[legend].width * 0.17 + (touching ? side * 0.2 : 0),
              Math.min(shoulder.y - floor.y + 0.22, config.player[opponent.legend].height * 0.95),
              (touching
                ? Math.max(0.3, Math.min(0.55, ahead - config.player[opponent.legend].width * 0.43))
                : 0.38) +
                extension * 0.18,
            );
          } else
            local.set(
              sx + sign * spans[i] * 0.82,
              shoulder.y - floor.y - 0.035,
              sz + spans[i] * 0.3,
            );
          // Keep the target inside the real rig's reach even while the opponent separates.
          target.copy(floor).addScaledVector(left, local.x).addScaledVector(forward, local.z);
          target.y = floor.y + local.y;
          point.copy(target).sub(shoulder);
          if (point.length() > spans[i] * 0.92) {
            target.copy(shoulder).addScaledVector(point.normalize(), spans[i] * 0.92);
            point.copy(target).sub(floor);
            local.set(point.dot(left), target.y - floor.y, point.dot(forward));
          }
        }
        if (weights[i] < 0.001) continue;
        target.copy(floor).addScaledVector(left, local.x).addScaledVector(forward, local.z);
        target.y = floor.y + local.y;
        normal.copy(forward);
        fingers.copy(brace ? forward : left).multiplyScalar(brace ? 0 : sign);
        if (brace) fingers.set(0, 1, 0);
        pole
          .copy(left)
          .multiplyScalar(sign * (brace ? 0.15 : 0.5))
          .addScaledVector(forward, brace ? 1.2 : 0.5);
        pole.y = brace ? -1 : -0.3;
        arms[i].solve(target, normal, fingers, pole, weights[i]);
      }
    },
  };
}
