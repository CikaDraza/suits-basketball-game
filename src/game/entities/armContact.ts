import { Bone, Matrix4, Quaternion, Vector3 } from 'three';
import type { Legend } from '../data/gameConfig';
import { clamp } from '../utils/math';
import { createPalmSocket, palmFrame, type HandSide } from './palmSockets';

const DEG = Math.PI / 180;
export function createArmContact(
  upper: Bone,
  fore: Bone,
  hand: Bone,
  legend: Legend,
  side: HandSide,
) {
  if (fore.parent !== upper || hand.parent !== fore || !(upper.parent instanceof Bone))
    throw new Error(`${legend} ${side}: unexpected shoulder/arm/forearm/hand hierarchy`);
  const socket = createPalmSocket(hand, legend, side);
  const restHand = hand.quaternion.clone().normalize();
  const upperBase = new Quaternion(),
    foreBase = new Quaternion(),
    handBase = new Quaternion();
  const origin = new Vector3(),
    elbow = new Vector3(),
    wrist = new Vector3(),
    desiredElbow = new Vector3(),
    end = new Vector3();
  const axis = new Vector3(),
    bend = new Vector3(),
    upperDir = new Vector3(),
    foreDir = new Vector3(),
    hinge = new Vector3();
  const x = new Vector3(),
    z = new Vector3(),
    finger = new Vector3(),
    normalProjected = new Vector3(),
    neutralNormal = new Vector3(),
    cross = new Vector3();
  const m = new Matrix4(),
    upperWorld = new Quaternion(),
    foreWorld = new Quaternion(),
    handWorld = new Quaternion(),
    desiredHand = new Quaternion(),
    neutralHand = new Quaternion(),
    parentInverse = new Quaternion(),
    roll = new Quaternion(),
    socketWorld = new Quaternion();
  const upperSolved = new Quaternion(),
    foreSolved = new Quaternion(),
    handSolved = new Quaternion();
  const socketInverse = socket.quaternion.clone().invert();
  const debug = {
    target: new Vector3(),
    palm: new Vector3(),
    normal: new Vector3(),
    wristBend: 0,
    forearmTwist: 0,
    elbowBend: 0,
    error: 0,
    weight: 0,
  };
  const pointWorld = (bone: Bone, world: Quaternion) => {
    bone.parent!.getWorldQuaternion(parentInverse).invert();
    bone.quaternion.copy(parentInverse).multiply(world).normalize();
    bone.updateWorldMatrix(false, true);
  };
  const frame = (direction: Vector3, normal: Vector3, out: Quaternion) => {
    x.copy(normal).addScaledVector(direction, -normal.dot(direction)).normalize();
    z.crossVectors(x, direction).normalize();
    x.crossVectors(direction, z).normalize();
    return out.setFromRotationMatrix(m.makeBasis(x, direction, z));
  };
  return {
    upper,
    fore,
    hand,
    socket,
    debug,
    resetHand() {
      hand.quaternion.copy(restHand);
    },
    solve(
      palmTarget: Vector3,
      palmNormal: Vector3,
      preferredFingers: Vector3,
      elbowPole: Vector3,
      weight: number,
    ) {
      upperBase.copy(upper.quaternion);
      foreBase.copy(fore.quaternion);
      handBase.copy(hand.quaternion);
      upper.updateWorldMatrix(true, true);
      upper.getWorldPosition(origin);
      fore.getWorldPosition(elbow);
      hand.getWorldPosition(wrist);
      const a = origin.distanceTo(elbow),
        b = elbow.distanceTo(wrist);
      palmFrame(palmNormal, preferredFingers, socketWorld);
      handWorld.copy(socketWorld).multiply(socketInverse);
      for (let iteration = 0; iteration < 5; iteration++) {
        end.copy(socket.position).applyQuaternion(handWorld).negate().add(palmTarget);
        axis.copy(end).sub(origin);
        const requested = axis.length();
        axis.normalize();
        const angle = Math.acos(
          clamp((requested * requested - a * a - b * b) / (2 * a * b), -1, 1),
        );
        const limited = clamp(angle, 25 * DEG, 150 * DEG);
        const reach = Math.sqrt(a * a + b * b + 2 * a * b * Math.cos(limited));
        bend.copy(elbowPole).addScaledVector(axis, -elbowPole.dot(axis)).normalize();
        const along = (a * a - b * b + reach * reach) / (2 * reach);
        const height = Math.sqrt(Math.max(0, a * a - along * along));
        desiredElbow.copy(origin).addScaledVector(axis, along).addScaledVector(bend, height);
        end.copy(origin).addScaledVector(axis, reach);
        upperDir.copy(desiredElbow).sub(origin).normalize();
        foreDir.copy(end).sub(desiredElbow).normalize();
        hinge.crossVectors(upperDir, foreDir).negate().normalize();
        frame(upperDir, hinge, upperWorld);
        frame(foreDir, hinge, foreWorld);
        // Pronation belongs mostly to the forearm, never a compensating 180° wrist rotation.
        neutralHand.copy(foreWorld).multiply(restHand).multiply(socket.quaternion);
        neutralNormal.set(0, 0, 1).applyQuaternion(neutralHand);
        neutralNormal.addScaledVector(foreDir, -neutralNormal.dot(foreDir)).normalize();
        normalProjected
          .copy(palmNormal)
          .addScaledVector(foreDir, -palmNormal.dot(foreDir))
          .normalize();
        const twist = clamp(
          Math.atan2(
            foreDir.dot(cross.crossVectors(neutralNormal, normalProjected)),
            neutralNormal.dot(normalProjected),
          ),
          -85 * DEG,
          85 * DEG,
        );
        roll.setFromAxisAngle(foreDir, twist);
        foreWorld.premultiply(roll);
        finger.copy(foreDir).addScaledVector(palmNormal, -foreDir.dot(palmNormal)).normalize();
        finger.multiplyScalar(0.75).addScaledVector(preferredFingers, 0.25).normalize();
        palmFrame(palmNormal, finger, socketWorld);
        desiredHand.copy(socketWorld).multiply(socketInverse);
        neutralHand.copy(foreWorld).multiply(restHand);
        const wristAngle = neutralHand.angleTo(desiredHand);
        handWorld
          .copy(neutralHand)
          .slerp(desiredHand, Math.min(1, (65 * DEG) / Math.max(wristAngle, 1e-8)));
        debug.forearmTwist = twist / DEG;
        debug.elbowBend = limited / DEG;
      }
      pointWorld(upper, upperWorld);
      pointWorld(fore, foreWorld);
      pointWorld(hand, handWorld);
      upperSolved.copy(upper.quaternion);
      foreSolved.copy(fore.quaternion);
      handSolved.copy(hand.quaternion);
      upper.quaternion.copy(upperBase).slerp(upperSolved, weight).normalize();
      fore.quaternion.copy(foreBase).slerp(foreSolved, weight).normalize();
      hand.quaternion.copy(handBase).slerp(handSolved, weight).normalize();
      // slerp targets are saved before the base is copied (no cumulative pose feedback).
      upper.updateWorldMatrix(true, true);
      socket.updateWorldMatrix(true, false);
      socket.getWorldPosition(debug.palm);
      socket.getWorldQuaternion(socketWorld);
      debug.normal.set(0, 0, 1).applyQuaternion(socketWorld);
      debug.target.copy(palmTarget);
      debug.error = debug.palm.distanceTo(palmTarget);
      debug.weight = weight;
      debug.wristBend = hand.quaternion.angleTo(restHand) / DEG;
    },
  };
}
