import { Bone, Object3D, Vector3 } from 'three';
import { config, type Legend } from '../data/gameConfig';
import type { BallHandlingState } from '../simulation/ballHandling';
import { smoothUnit } from '../simulation/ballHandling';
import { createArmContact } from './armContact';

export function createHandContactPose(model: Object3D, legend: Legend) {
  const bones: Record<string, Bone> = {};
  model.traverse((o) => {
    if (o instanceof Bone) bones[o.name.replace(/^mixamorig:?/, '')] = o;
  });
  const arms = (['Left', 'Right'] as const).map((side) => {
    const upper = bones[side + 'Arm'],
      fore = bones[side + 'ForeArm'],
      hand = bones[side + 'Hand'];
    if (!upper || !fore || !hand) throw new Error(`${legend}: missing ${side} arm chain`);
    return createArmContact(upper, fore, hand, legend, side);
  });
  model.userData.handContacts = arms;
  const target = new Vector3(),
    normal = new Vector3(),
    pole = new Vector3(),
    finger = new Vector3();
  const left = new Vector3(),
    forward = new Vector3();
  const weights = [0, 0];
  const memory = [0, 1].map(() => ({
    role: 'none',
    time: 0,
    lastTarget: new Vector3(),
    lastNormal: new Vector3(),
    lastFinger: new Vector3(),
    lastPole: new Vector3(),
    fromTarget: new Vector3(),
    fromNormal: new Vector3(),
    fromFinger: new Vector3(),
    fromPole: new Vector3(),
  }));
  return {
    arms,
    reset() {
      arms.forEach((a) => a.resetHand());
    },
    update(
      ball: Vector3,
      controlled: boolean,
      incoming: boolean,
      dribbling: boolean,
      state: BallHandlingState,
      floor: Vector3,
      angle: number,
      dt: number,
    ) {
      left.set(Math.cos(angle), 0, -Math.sin(angle));
      forward.set(Math.sin(angle), 0, Math.cos(angle));
      for (let i = 0; i < arms.length; i++) {
        const sign = i === 0 ? 1 : -1;
        const active = (controlled && (!dribbling || state.hand === sign)) || incoming;
        const pose = memory[i];
        const role = active ? (dribbling && controlled ? 'dribble' : 'hold') : 'none';
        weights[i] +=
          (Number(active) - weights[i]) * (1 - Math.exp(-config.ballControl.armBlendRate * dt));
        if (active) {
          if (dribbling && controlled) {
            const shape = config.ballControl[legend];
            target
              .copy(floor)
              .addScaledVector(left, sign * shape.hipSide)
              .addScaledVector(forward, shape.dribbleForward);
            const contact =
              state.phase < 0.16
                ? 1 - smoothUnit(state.phase / 0.16)
                : state.phase > 0.84
                  ? smoothUnit((state.phase - 0.84) / 0.16)
                  : 0;
            target.x += (ball.x - target.x) * contact;
            target.z += (ball.z - target.z) * contact;
            target.y =
              floor.y +
              shape.dribbleTop +
              config.ball.radius -
              Math.min(0.06, Math.max(0, floor.y + shape.dribbleTop - ball.y)) * contact;
            normal.set(0, -1, 0);
            finger.copy(forward);
            pole.copy(left).multiplyScalar(sign).addScaledVector(forward, 0.3);
            pole.y = -0.1;
          } else {
            normal
              .copy(left)
              .multiplyScalar(sign * 0.9)
              .addScaledVector(forward, 0.35);
            normal.y = -0.1;
            normal.normalize();
            target.copy(ball).addScaledVector(normal, config.ball.radius);
            normal.negate();
            finger.set(0, 1, 0).addScaledVector(forward, 0.15).normalize();
            pole
              .copy(left)
              .multiplyScalar(sign * 0.6)
              .addScaledVector(forward, 0.1);
            pole.y = -1;
          }
          if (role !== pose.role) {
            if (pose.role !== 'none') {
              pose.fromTarget.copy(pose.lastTarget);
              pose.fromNormal.copy(pose.lastNormal);
              pose.fromFinger.copy(pose.lastFinger);
              pose.fromPole.copy(pose.lastPole);
              pose.time = 0;
            } else {
              pose.fromTarget.copy(target);
              pose.fromNormal.copy(normal);
              pose.fromFinger.copy(finger);
              pose.fromPole.copy(pole);
              pose.time = config.ballControl.transitionTime;
            }
          }
          const blend = smoothUnit(pose.time / config.ballControl.transitionTime);
          target.lerpVectors(pose.fromTarget, target, blend);
          normal.lerpVectors(pose.fromNormal, normal, blend).normalize();
          finger.lerpVectors(pose.fromFinger, finger, blend).normalize();
          pole.lerpVectors(pose.fromPole, pole, blend).normalize();
          pose.time += dt;
          pose.lastTarget.copy(target);
          pose.lastNormal.copy(normal);
          pose.lastFinger.copy(finger);
          pose.lastPole.copy(pole);
        }
        pose.role = role;
        if (weights[i] > 0.001) {
          if (!active) {
            target.copy(pose.lastTarget);
            normal.copy(pose.lastNormal);
            finger.copy(pose.lastFinger);
            pole.copy(pose.lastPole);
          }
          arms[i].solve(target, normal, finger, pole, weights[i]);
        } else arms[i].debug.weight = 0;
      }
    },
  };
}
