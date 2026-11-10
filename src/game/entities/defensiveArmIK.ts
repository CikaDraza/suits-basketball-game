import { Matrix4, Quaternion, Vector3 } from 'three';
import type { createArmContact } from './armContact';
import { palmFrame } from './palmSockets';
import { clamp } from '../utils/math';

type ContactArm = ReturnType<typeof createArmContact>;
export interface DefensiveArmLimits {
  minFlex: number;
  maxFlex: number;
  maxTwist: number;
  maxWrist: number;
}
const DEG = Math.PI / 180;

/** Independent defensive solver; basketball contact keeps its existing solver and limits. */
export function createDefensiveArmIK(arm: ContactArm) {
  const { upper, fore, hand, socket } = arm;
  upper.updateWorldMatrix(true, true);
  const upperBind = upper.getWorldQuaternion(new Quaternion());
  const foreBind = fore.getWorldQuaternion(new Quaternion());
  const parentBind = upper.parent!.getWorldQuaternion(new Quaternion());
  const parentBindInverse = parentBind.clone().invert();
  const handRest = hand.quaternion.clone();
  const origin = upper.getWorldPosition(new Vector3());
  const elbow = fore.getWorldPosition(new Vector3());
  const wrist = hand.getWorldPosition(new Vector3());
  const upperLength = origin.distanceTo(elbow),
    foreLength = elbow.distanceTo(wrist);
  const length = upperLength + foreLength;
  const bindUpperDirection = elbow.clone().sub(origin).normalize();
  const bindForeDirection = wrist.clone().sub(elbow).normalize();
  // In the authored T pose, forward flexion determines the rig's elbow hinge.
  const bindHinge = bindUpperDirection
    .clone()
    .cross(new Vector3(0, 0, 1))
    .normalize();
  const hingeLocal = bindHinge.clone().applyQuaternion(upperBind.clone().invert());
  const defaultBend = bindUpperDirection
    .clone()
    .cross(bindHinge)
    .applyQuaternion(parentBind.clone().invert());
  const bindAxisParent = bindUpperDirection.clone().applyQuaternion(parentBind.clone().invert());
  const fallbackHinge = bindHinge.clone().applyQuaternion(parentBindInverse);
  const x = new Vector3(),
    z = new Vector3(),
    matrix = new Matrix4();
  function frame(direction: Vector3, hinge: Vector3, out: Quaternion) {
    x.copy(hinge).addScaledVector(direction, -hinge.dot(direction)).normalize();
    z.crossVectors(x, direction).normalize();
    x.crossVectors(direction, z).normalize();
    return out.setFromRotationMatrix(matrix.makeBasis(x, direction, z));
  }
  const upperCorrection = frame(bindUpperDirection, bindHinge, new Quaternion())
    .invert()
    .multiply(upperBind);
  const foreCorrection = frame(bindForeDirection, bindHinge, new Quaternion())
    .invert()
    .multiply(foreBind);
  const socketInverse = socket.quaternion.clone().invert();
  const previousBend = defaultBend.clone();
  const previousHandLocal = hand.quaternion.clone().normalize();
  const previousTarget = new Vector3(),
    previousDesiredHand = new Quaternion();
  let hasPrevious = false;
  let previousTwist = 0;
  const parentWorld = new Quaternion(),
    inverseParent = new Quaternion();
  const upperWorld = new Quaternion(),
    foreWorld = new Quaternion(),
    handWorld = new Quaternion();
  const desiredHand = new Quaternion(),
    neutralHand = new Quaternion(),
    roll = new Quaternion();
  const socketWorld = new Quaternion(),
    handActual = new Quaternion();
  const upperBase = new Quaternion(),
    foreBase = new Quaternion(),
    handBase = new Quaternion();
  const upperSolved = new Quaternion(),
    foreSolved = new Quaternion(),
    handSolved = new Quaternion();
  const candidateHandLocal = new Quaternion();
  const axis = new Vector3(),
    bend = new Vector3(),
    oldBend = new Vector3();
  const upperDirection = new Vector3(),
    foreDirection = new Vector3(),
    hinge = new Vector3();
  const wristGoal = new Vector3(),
    elbowGoal = new Vector3(),
    end = new Vector3();
  const neutralNormal = new Vector3(),
    desiredNormal = new Vector3(),
    cross = new Vector3();
  const actualUpper = new Vector3(),
    actualFore = new Vector3(),
    actualHinge = new Vector3();
  const debug = {
    upperLength,
    foreLength,
    length,
    hingeLocal: { ...hingeLocal },
    wrist: new Vector3(),
    wristTarget: new Vector3(),
    elbow: new Vector3(),
    shoulder: new Vector3(),
    upperDirection: new Vector3(),
    foreDirection: new Vector3(),
    elbowPlaneError: 0,
    elbowFlex: 0,
    wristBend: 0,
    forearmTwist: 0,
    requestedReach: 0,
    reachableReach: 0,
    poleProjection: 1,
    poleFallback: false,
    contactError: 0,
    weight: 0,
    wristContinuityLimited: false,
  };
  const setWorld = (bone: typeof upper, q: Quaternion) => {
    bone.parent!.getWorldQuaternion(inverseParent).invert();
    bone.quaternion.copy(inverseParent).multiply(q).normalize();
    bone.updateWorldMatrix(false, true);
  };
  return {
    arm,
    debug,
    upperLength,
    foreLength,
    length,
    reach(flexDegrees: number) {
      return Math.sqrt(
        upperLength ** 2 +
          foreLength ** 2 +
          2 * upperLength * foreLength * Math.cos(flexDegrees * DEG),
      );
    },
    reset() {
      hasPrevious = false;
    },
    solve(
      palmTarget: Vector3,
      normal: Vector3,
      fingers: Vector3,
      pole: Vector3,
      weight: number,
      limits: DefensiveArmLimits,
      dt = 1 / 60,
    ) {
      upperBase.copy(upper.quaternion);
      foreBase.copy(fore.quaternion);
      handBase.copy(hand.quaternion);
      upper.updateWorldMatrix(true, true);
      upper.getWorldPosition(origin);
      upper.parent!.getWorldQuaternion(parentWorld);
      palmFrame(normal, fingers, socketWorld);
      desiredHand.copy(socketWorld).multiply(socketInverse);
      handWorld.copy(desiredHand);
      const smallChange =
        hasPrevious &&
        previousTarget.distanceTo(palmTarget) < length * 0.1 &&
        previousDesiredHand.angleTo(desiredHand) < 0.25;
      const wristStep = Math.min(0.35, 8 * dt);
      const maxReach = this.reach(limits.minFlex),
        minReach = this.reach(limits.maxFlex);
      debug.poleFallback = false;
      debug.wristContinuityLimited = false;
      // Solve the requested wrist once. Feeding a constrained palm rotation back
      // into this target can create multiple solutions and discontinuous elbow rolls.
      wristGoal.copy(socket.position).applyQuaternion(handWorld).negate().add(palmTarget);
      axis.copy(wristGoal).sub(origin);
      debug.requestedReach = axis.length();
      if (axis.lengthSq() < 1e-12) axis.copy(bindAxisParent).applyQuaternion(parentWorld);
      axis.normalize();
      const distance = clamp(debug.requestedReach, minReach, maxReach);
      debug.reachableReach = distance;
      oldBend.copy(hasPrevious ? previousBend : defaultBend).applyQuaternion(parentWorld);
      oldBend.addScaledVector(axis, -oldBend.dot(axis));
      if (oldBend.lengthSq() < 1e-10) {
        oldBend.copy(fallbackHinge).applyQuaternion(parentWorld);
        oldBend.addScaledVector(axis, -oldBend.dot(axis));
      }
      oldBend.normalize();
      bend.copy(pole).addScaledVector(axis, -pole.dot(axis));
      const projection = bend.length() / Math.max(1e-8, pole.length());
      debug.poleProjection = projection;
      // Keep the same bend hemisphere on both sides of the singular cone.
      // Dropping this continuity rule at the cone boundary can flip the forearm.
      if ((hasPrevious || projection < 0.15) && bend.dot(oldBend) < 0) bend.negate();
      if (projection < 0.15) {
        debug.poleFallback = true;
        if (bend.lengthSq() > 1e-12) bend.normalize();
        else bend.copy(oldBend);
        const t = clamp((projection - 0.03) / 0.12, 0, 1);
        bend.lerpVectors(oldBend, bend, t * t * (3 - 2 * t)).normalize();
      } else bend.normalize();
      const along = (upperLength ** 2 - foreLength ** 2 + distance ** 2) / (2 * distance);
      const height = Math.sqrt(Math.max(0, upperLength ** 2 - along ** 2));
      elbowGoal.copy(origin).addScaledVector(axis, along).addScaledVector(bend, height);
      end.copy(origin).addScaledVector(axis, distance);
      upperDirection.copy(elbowGoal).sub(origin).normalize();
      foreDirection.copy(end).sub(elbowGoal).normalize();
      hinge.crossVectors(upperDirection, foreDirection).normalize();
      frame(upperDirection, hinge, upperWorld).multiply(upperCorrection);
      frame(foreDirection, hinge, foreWorld).multiply(foreCorrection);
      neutralHand.copy(foreWorld).multiply(handRest).multiply(socket.quaternion);
      neutralNormal.set(0, 0, 1).applyQuaternion(neutralHand);
      neutralNormal.addScaledVector(foreDirection, -neutralNormal.dot(foreDirection)).normalize();
      desiredNormal
        .copy(normal)
        .addScaledVector(foreDirection, -normal.dot(foreDirection))
        .normalize();
      let requestedTwist = Math.atan2(
        foreDirection.dot(cross.crossVectors(neutralNormal, desiredNormal)),
        neutralNormal.dot(desiredNormal),
      );
      if (hasPrevious)
        requestedTwist +=
          Math.round((previousTwist - requestedTwist) / (2 * Math.PI)) * 2 * Math.PI;
      const twist = clamp(requestedTwist, -limits.maxTwist * DEG, limits.maxTwist * DEG);
      roll.setFromAxisAngle(foreDirection, twist);
      foreWorld.premultiply(roll);
      neutralHand.copy(foreWorld).multiply(handRest);
      const wristAngle = neutralHand.angleTo(desiredHand);
      handWorld
        .copy(neutralHand)
        .slerp(desiredHand, Math.min(1, (limits.maxWrist * DEG) / Math.max(1e-8, wristAngle)));
      // At a 180° request a clamped wrist has two equally distant branches.
      // Bound local travel for small goal changes instead of switching branches.
      if (smallChange) {
        candidateHandLocal.copy(foreWorld).invert().multiply(handWorld).normalize();
        const travel = previousHandLocal.angleTo(candidateHandLocal);
        if (travel > wristStep) {
          candidateHandLocal.slerpQuaternions(
            previousHandLocal,
            handSolved.copy(candidateHandLocal),
            wristStep / travel,
          );
          handWorld.copy(foreWorld).multiply(candidateHandLocal);
          debug.wristContinuityLimited = true;
        }
      }
      debug.forearmTwist = twist / DEG;
      previousTwist = requestedTwist;
      previousBend.copy(bend).applyQuaternion(inverseParent.copy(parentWorld).invert());
      hasPrevious = true;
      setWorld(upper, upperWorld);
      setWorld(fore, foreWorld);
      setWorld(hand, handWorld);
      upper.quaternion.slerpQuaternions(upperBase, upperSolved.copy(upper.quaternion), weight);
      fore.quaternion.slerpQuaternions(foreBase, foreSolved.copy(fore.quaternion), weight);
      hand.quaternion.slerpQuaternions(handBase, handSolved.copy(hand.quaternion), weight);
      previousHandLocal.copy(hand.quaternion).normalize();
      previousTarget.copy(palmTarget);
      previousDesiredHand.copy(desiredHand);
      upper.updateWorldMatrix(true, true);
      upper.getWorldPosition(debug.shoulder);
      fore.getWorldPosition(debug.elbow);
      hand.getWorldPosition(debug.wrist);
      debug.wristTarget.copy(wristGoal);
      actualUpper.copy(debug.elbow).sub(debug.shoulder).normalize();
      actualFore.copy(debug.wrist).sub(debug.elbow).normalize();
      debug.upperDirection.copy(actualUpper);
      debug.foreDirection.copy(actualFore);
      actualHinge.crossVectors(actualUpper, actualFore).normalize();
      hinge.copy(hingeLocal).applyQuaternion(upper.getWorldQuaternion(handActual));
      debug.elbowPlaneError = actualHinge.angleTo(hinge) / DEG;
      debug.elbowFlex = actualUpper.angleTo(actualFore) / DEG;
      debug.wristBend = hand.quaternion.angleTo(handRest) / DEG;
      debug.weight = weight;
      socket.getWorldPosition(arm.debug.palm);
      socket.getWorldQuaternion(socketWorld);
      arm.debug.normal.set(0, 0, 1).applyQuaternion(socketWorld);
      arm.debug.target.copy(palmTarget);
      arm.debug.error = arm.debug.palm.distanceTo(palmTarget);
      arm.debug.weight = weight;
      arm.debug.elbowBend = debug.elbowFlex;
      arm.debug.forearmTwist = debug.forearmTwist;
      arm.debug.wristBend = debug.wristBend;
      debug.contactError = arm.debug.error;
    },
  };
}
