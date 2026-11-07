import { Matrix4, Object3D, Quaternion, Vector3, type Bone } from 'three';
import type { Legend } from '../data/gameConfig';
export type HandSide = 'Left' | 'Right';
interface PalmCalibration {
  position: readonly [number, number, number];
  along: readonly [number, number, number];
  normal: readonly [number, number, number];
}
// Metres in each actual hand bone's local frame, measured from the authored palm skin/knuckles.
export const PALM_CALIBRATION: Record<Legend, Record<HandSide, PalmCalibration>> = {
  shaq: {
    Left: {
      position: [-0.001, 0.072, -0.046],
      along: [-0.098817, 0.994854, -0.022377],
      normal: [0.152329, -0.007099, -0.988305],
    },
    Right: {
      position: [0.001, 0.069, -0.046],
      along: [0.100793, 0.994711, -0.019789],
      normal: [-0.151872, -0.004274, -0.988391],
    },
  },
  chuck: {
    Left: {
      position: [-0.001, 0.06, -0.036],
      along: [-0.108043, 0.993458, -0.036981],
      normal: [0.224162, -0.011896, -0.974479],
    },
    Right: {
      position: [0.001, 0.053, -0.034],
      along: [0.118036, 0.992138, -0.041586],
      normal: [-0.221907, -0.014466, -0.974961],
    },
  },
};
const frameX = new Vector3(),
  frameY = new Vector3(),
  frameZ = new Vector3(),
  frameMatrix = new Matrix4();

/** Canonical socket +Z points out of the palm; +Y follows the fingers. */
export function palmFrame(normal: Vector3, along: Vector3, out: Quaternion): Quaternion {
  const z = frameZ.copy(normal).normalize();
  const y = frameY.copy(along).addScaledVector(z, -along.dot(z)).normalize();
  if (y.lengthSq() < 1e-8) y.set(0, 1, 0).addScaledVector(z, -z.y).normalize();
  const x = frameX.crossVectors(y, z).normalize();
  y.crossVectors(z, x).normalize();
  return out.setFromRotationMatrix(frameMatrix.makeBasis(x, y, z));
}
export function createPalmSocket(hand: Bone, legend: Legend, side: HandSide): Object3D {
  const calibration = PALM_CALIBRATION[legend][side];
  const socket = new Object3D();
  socket.name = `palm-${side.toLowerCase()}`;
  socket.position.fromArray(calibration.position);
  palmFrame(
    new Vector3(...calibration.normal),
    new Vector3(...calibration.along),
    socket.quaternion,
  );
  hand.add(socket);
  return socket;
}
