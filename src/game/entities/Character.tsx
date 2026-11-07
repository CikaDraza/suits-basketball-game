import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import {
  Bone,
  Euler,
  Group,
  Mesh,
  Object3D,
  Quaternion,
  SkinnedMesh,
  Vector3,
  type Skeleton,
} from 'three';
import { config, type Legend } from '../data/gameConfig';
import { MODEL_PATHS } from '../assets/manifest';
import { clamp, dampingFactor } from '../utils/math';
import { isSimulationRunning } from '../simulation/isSimulationRunning';
import type { PlayerSlot } from '../simulation/types';
import { bodies, duel } from './Duel';
import { hoop } from '../court/hoopRig';
import { createShadowTexture } from '../court/courtGeometry';
import { createFaceController } from './faceController';
import { createFootGrounding } from './footGrounding';
import { contactArm, sampleFootstep } from './locomotion';
import { createLimbIK } from './limbIK';
import { createHandContactPose } from './handContactPose';
import { protectedBallTarget, smoothUnit } from '../simulation/ballHandling';
import { HandContactDebug } from './HandContactDebug';

Object.values(MODEL_PATHS).forEach((p) => useGLTF.preload(p));

const BONES = [
  'Hips',
  'Spine',
  'Spine1',
  'Spine2',
  'Neck',
  'Head',
  'LeftArm',
  'LeftForeArm',
  'LeftHand',
  'RightArm',
  'RightForeArm',
  'RightHand',
  'LeftUpLeg',
  'LeftLeg',
  'LeftFoot',
  'RightUpLeg',
  'RightLeg',
  'RightFoot',
] as const;
type BoneName = (typeof BONES)[number];

interface Rig {
  bones: Partial<Record<BoneName, Bone>>;
  restLocal: Partial<Record<BoneName, Quaternion>>;
  model: Partial<Record<BoneName, Quaternion>>;
  modelInv: Partial<Record<BoneName, Quaternion>>;
  hipsRestPosition: Vector3;
  hipH: number; // hip height above the floor
  reach: number; // standing overhead reach (hands straight up)
  headY: number;
}

/** Collect Mixamo bones and their rest frames in model space (clone root must be detached). */
function buildRig(root: Object3D): Rig {
  root.updateMatrixWorld(true);
  const rig: Rig = {
    bones: {},
    restLocal: {},
    model: {},
    modelInv: {},
    hipsRestPosition: new Vector3(),
    hipH: 1,
    reach: 2.6,
    headY: 1.9,
  };
  root.traverse((o) => {
    if (!(o instanceof Bone)) return;
    const name = o.name.replace(/^mixamorig:?/, '') as BoneName;
    if (!(BONES as readonly string[]).includes(name) || rig.bones[name]) return;
    rig.bones[name] = o;
    rig.restLocal[name] = o.quaternion.clone();
    const q = o.getWorldQuaternion(new Quaternion());
    rig.model[name] = q;
    rig.modelInv[name] = q.clone().invert();
  });
  const w = (n: BoneName) => rig.bones[n]?.getWorldPosition(new Vector3()) ?? new Vector3();
  if (rig.bones.Hips) {
    rig.hipsRestPosition.copy(rig.bones.Hips.position);
    rig.hipH = w('Hips').y;
  }
  const shoulder = w('LeftArm'),
    hand = w('LeftHand');
  rig.reach = shoulder.y + shoulder.distanceTo(hand) + 0.1;
  rig.headY = w('Head').y;
  return rig;
}

const _qa = new Quaternion(),
  _qr = new Quaternion(),
  _e = new Euler();
/** Rotate a bone by R, expressed in rest-pose model axes (+X = character's left, +Y up, +Z forward). */
function drive(
  rig: Rig,
  name: BoneName,
  x: number,
  y: number,
  z: number,
  order: 'XYZ' | 'YXZ' = 'XYZ',
) {
  const b = rig.bones[name];
  if (!b) return;
  _qr.setFromEuler(_e.set(x, y, z, order));
  _qa.copy(rig.modelInv[name]!).multiply(_qr).multiply(rig.model[name]!);
  b.quaternion.copy(rig.restLocal[name]!).multiply(_qa);
}

type Pose = {
  lDown: number;
  lPitch: number;
  lElbow: number;
  rDown: number;
  rPitch: number;
  rElbow: number;
  /** horizontal adduction: swings the upper arm in across the chest (two-hand hold) */
  lIn: number;
  rIn: number;
  lSwing: number;
  lKnee: number;
  rSwing: number;
  rKnee: number;
  spread: number;
  lean: number;
  twist: number;
  headYaw: number;
  headPitch: number;
  crouch: number;
  footPlant: number;
};
const REST: Pose = {
  lDown: 1.3,
  lPitch: 0,
  lElbow: 0.15,
  rDown: 1.3,
  rPitch: 0,
  rElbow: 0.15,
  lIn: 0,
  rIn: 0,
  lSwing: 0,
  lKnee: 0.05,
  rSwing: 0,
  rKnee: 0.05,
  spread: 0.04,
  lean: 0.03,
  twist: 0,
  headYaw: 0,
  headPitch: 0,
  crouch: 0.02,
  footPlant: 0,
};
interface CharacterProps {
  readonly index: PlayerSlot;
  readonly legend: Legend;
}

/** Rigged GLB characters. Each clone owns its skeleton; geometry/materials belong to the loader cache. */
export function Character({ index, legend }: CharacterProps) {
  const gltf = useGLTF(MODEL_PATHS[legend]);
  const { model, rig, face, skeletons, groundFeet, legs, hands } = useMemo(() => {
    const model = cloneSkinned(gltf.scene);
    const skeletons = new Set<Skeleton>();
    model.traverse((object) => {
      if (object instanceof Mesh) object.frustumCulled = false;
      if (object instanceof SkinnedMesh) skeletons.add(object.skeleton);
    });
    const rig = buildRig(model);
    return {
      model,
      rig,
      face: createFaceController(model),
      skeletons,
      legs: (['Left', 'Right'] as const).map((side) => {
        const thigh = rig.bones[`${side}UpLeg`],
          shin = rig.bones[`${side}Leg`],
          foot = rig.bones[`${side}Foot`];
        return thigh && shin && foot ? { foot, solve: createLimbIK(thigh, shin, foot) } : null;
      }),
      hands: createHandContactPose(model, legend),
      groundFeet: createFootGrounding(
        model,
        rig.bones.Hips,
        rig.bones.LeftFoot,
        rig.bones.RightFoot,
      ),
    };
  }, [gltf.scene, legend]);
  const shadowTexture = useMemo(createShadowTexture, []);
  useEffect(() => () => shadowTexture.dispose(), [shadowTexture]);
  useEffect(
    () => () => {
      // SkeletonUtils shares the loader's geometry/materials but clones Skeleton objects.
      // Only release the clone's bone textures; cached GLB resources remain reusable.
      for (const skeleton of skeletons) skeleton.dispose();
    },
    [skeletons],
  );

  const state = useRef({
    pose: { ...REST },
    phase: 0,
    motionX: 0,
    motionZ: 0,
    motionTime: -1,
    revision: -1,
    speed: 0,
    gaitWeight: 0,
    directionX: 0,
    directionZ: 1,
    contactSide: 1 as -1 | 1,
    downS: 0,
    liftY: 0,
    offX: 0,
    offZ: 0,
    blinkAt: 2 + index,
    blink: 0,
    jaw: 0,
    gx: 0,
    gy: 0,
    face: { blinkLeft: 0, blinkRight: 0, jawOpen: 0, gazeX: 0, gazeY: 0 },
  });

  const lift = useRef<Group>(null),
    floor = useRef<Group>(null),
    turn = useRef<Group>(null),
    fall = useRef<Group>(null),
    blob = useRef<Mesh>(null);
  const target = useMemo<Pose>(() => ({ ...REST }), []);
  // The collider settles at halfHeight + radius; bodyY is only the initial spawn height.
  const bodyY = config.physics.halfHeight + config.physics.radius;
  const groundPoint = useMemo(() => new Vector3(), []);
  const footTarget = useMemo(() => new Vector3(), []);
  const forward = useMemo(() => new Vector3(), []);
  const ballPoint = useMemo(() => new Vector3(), []);
  const catchPoint = useMemo(() => new Vector3(), []);
  const incomingPoint = useMemo(() => new Vector3(), []);

  useFrame((_, rawDt) => {
    if (!isSimulationRunning()) return;
    const st = state.current;
    const dt = Math.min(rawDt, 0.05);
    const p = duel.players[index];
    if (!p || !lift.current || !turn.current || !fall.current) return;
    const t = duel.time,
      s = config.shots;
    const body = bodies.players[index]?.translation();
    const x = body?.x ?? p.x,
      z = body?.z ?? p.z;
    const elapsed = t - st.motionTime;
    const dx = x - st.motionX,
      dz = z - st.motionZ;
    const distance = Math.hypot(dx, dz);
    const resetMotion =
      st.motionTime < 0 ||
      st.revision !== duel.revision ||
      elapsed < 0 ||
      distance > config.animation.teleportDistance;
    const speed = resetMotion ? 0 : elapsed > 0 ? distance / elapsed : st.speed;
    if (resetMotion) {
      st.phase = 0;
      st.speed = 0;
      st.gaitWeight = 0;
    }
    const stride = p.mode === 'post' ? config.animation.postStride : config.animation.walkStride;
    if (!resetMotion && distance > 1e-6 && speed > config.animation.motionDeadzone) {
      st.phase += distance / (2 * stride);
      st.directionX = dx / distance;
      st.directionZ = dz / distance;
    }
    st.speed += (speed - st.speed) * dampingFactor(16, dt);
    st.gaitWeight +=
      ((speed > config.animation.motionDeadzone ? 1 : 0) - st.gaitWeight) * dampingFactor(18, dt);
    st.motionX = x;
    st.motionZ = z;
    st.motionTime = t;
    st.revision = duel.revision;
    const mv = clamp(st.speed / config.player[legend].speed, 0, 1);
    const owner = duel.owner === index;
    const exhausted = p.energy < config.player.exhaustedThreshold;
    const rimDx = hoop.rimWorld.x - p.x,
      rimDz = hoop.rimWorld.z - p.z;

    hands.reset();
    // ---------- target pose ----------
    Object.assign(target, REST);
    const sw = Math.sin(st.phase * Math.PI * 2);
    target.lSwing = target.rSwing = 0.25 * mv;
    target.lKnee = target.rKnee = 0.08 + 0.5 * mv;
    target.footPlant = st.gaitWeight;
    target.lPitch = sw * 0.45 * mv;
    target.rPitch = -sw * 0.45 * mv;
    target.lElbow = 0.25 + 0.2 * mv;
    target.rElbow = 0.25 + 0.2 * mv;
    target.lean = 0.04 + 0.1 * mv + Math.sin(t * (exhausted ? 7 : 3)) * (exhausted ? 0.04 : 0.012);
    target.crouch = 0.02 + Math.abs(sw) * 0.03 * mv;

    // look at the ball (head yaw in local frame)
    const bx = duel.ball.x - p.x,
      bz = duel.ball.z - p.z;
    const lx = bx * Math.cos(p.angle) - bz * Math.sin(p.angle),
      lz = bx * Math.sin(p.angle) + bz * Math.cos(p.angle);
    const look = Math.atan2(lx, Math.max(0.2, lz));
    target.headYaw = clamp(look * 0.55, -0.7, 0.7);
    target.headPitch = clamp(
      (-(duel.ball.y - rig.headY) / Math.max(1, Math.hypot(bx, bz))) * 0.4,
      -0.45,
      0.35,
    );

    const awaitingPass =
      (duel.ballState === 'inbound' || duel.ballState === 'pass') && duel.inboundOwner === index;
    const receiving =
      awaitingPass &&
      duel.ballState === 'pass' &&
      Math.hypot(duel.ball.x - p.x, duel.ball.z - p.z) < config.animation.catchReadyDistance;
    const holdBall =
      (receiving || (owner && duel.ballState === 'held' && p.handling === 'hold')) &&
      p.charge === 0 &&
      p.mode !== 'post' &&
      p.mode !== 'spin' &&
      p.mode !== 'shoot' &&
      p.mode !== 'dunk';
    if (holdBall) {
      // triple threat: ball locked at the chest with BOTH hands, knees bent, eyes on the rim
      // upper arms down-forward and in, forearms forward-in → palms meet on the ball at the chest
      target.lPitch = target.rPitch = -0.6;
      target.lDown = target.rDown = 1.3;
      target.lElbow = target.rElbow = 1.15;
      target.lIn = target.rIn = 0.45;
      target.crouch = 0.07;
      target.lKnee = target.rKnee = 0.24 + 0.4 * mv;
      target.lean = 0.14;
      target.lSwing = target.rSwing = 0.05 + 0.2 * mv;
      target.spread = 0.09;
    }
    if (exhausted && p.mode === 'idle' && mv < 0.2) {
      // hands on knees, sucking air
      target.lean = 0.5 + Math.sin(t * 7) * 0.04;
      target.crouch = 0.12;
      target.lKnee = target.rKnee = 0.4;
      target.lSwing = target.rSwing = 0.2;
      target.lDown = target.rDown = 1.45;
      target.lPitch = target.rPitch = -0.55;
      target.lElbow = target.rElbow = 0.25;
      target.headPitch = -0.35;
    }
    if (p.charge > 0) {
      const r = Math.min(1, p.charge / s.perfectTime);
      // set point: upper arms come forward to horizontal, forearms vertical → ball at the forehead
      target.lPitch = target.rPitch = -(0.6 + 1.15 * r);
      target.lDown = target.rDown = 1.3 - 0.05 * r;
      target.lElbow = target.rElbow = 0.6 + 0.45 * r;
      target.crouch = 0.08 * (1 - r) + 0.02;
      target.lKnee = target.rKnee = 0.25 * (1 - r) + 0.08;
      target.headPitch = -0.15;
    }
    switch (p.mode) {
      case 'shoot': {
        const hook = Math.hypot(rimDx, rimDz) < s.hookRange;
        target.rPitch = hook ? -3.0 : -2.75;
        target.rElbow = 0.12;
        target.rDown = 1.3;
        target.lPitch = hook ? -0.6 : -2.6;
        target.lElbow = hook ? 0.6 : 0.2;
        target.lDown = hook ? 0.8 : 1.3;
        target.headPitch = -0.3;
        target.lean = -0.04;
        break;
      }
      case 'contest': {
        const up = (lft: boolean) => lft === p.hand > 0;
        target.lPitch = up(true) ? -3.05 : -2.2;
        target.lElbow = 0.05;
        target.lDown = 1.2;
        target.rPitch = up(false) ? -3.05 : -2.2;
        target.rElbow = 0.05;
        target.rDown = 1.2;
        target.lean = -0.06;
        target.headPitch = -0.15;
        break;
      }
      case 'post':
        target.crouch = 0.17;
        target.lKnee += 1.02;
        target.rKnee += 1.02;
        target.lSwing += 0.55;
        target.rSwing += 0.55;
        target.footPlant = 1;
        target.lean = 0.38;
        if (p.charge === 0) {
          target.lDown = target.rDown = 0.85;
          target.lPitch = target.rPitch = -0.45;
          target.lElbow = target.rElbow = 1.6;
        }
        target.spread = 0.14;
        if (awaitingPass) {
          const defender = duel.players[1 - index];
          const gx = defender.x - p.x,
            gz = defender.z - p.z;
          const localX = gx * Math.cos(p.angle) - gz * Math.sin(p.angle);
          const localZ = gx * Math.sin(p.angle) + gz * Math.cos(p.angle);
          st.contactSide = contactArm(localX, st.contactSide, config.animation.contactSideDeadzone);
          const close =
            Math.hypot(gx, gz) < config.physics.radius * 2 + config.animation.contactReach;
          const left = st.contactSide > 0;
          // Bent contact arm shields space; the opposite open hand offers a target.
          target.lPitch = left ? (localZ > 0 ? -0.4 : 0.3) : -1.65;
          target.rPitch = left ? -1.65 : localZ > 0 ? -0.4 : 0.3;
          target.lDown = left ? (close ? 0.85 : 1.05) : 0.95;
          target.rDown = left ? 0.95 : close ? 0.85 : 1.05;
          target.lElbow = left ? 1.1 : 0.35;
          target.rElbow = left ? 0.35 : 1.1;
          target.twist = (left ? -1 : 1) * 0.18;
          target.headYaw = clamp(look, -0.9, 0.9);
        }
        break;
      case 'spin':
        target.lDown = target.rDown = 1.2;
        target.lPitch = target.rPitch = -0.9;
        target.lElbow = target.rElbow = 1.6;
        target.lean = 0.22;
        target.crouch = 0.1;
        break;
      case 'stun':
        target.headYaw = Math.sin(t * 14) * 0.45;
        target.headPitch = 0.2;
        target.lDown = 0.6 + Math.sin(t * 17) * 0.4;
        target.rDown = 0.6 + Math.cos(t * 15) * 0.4;
        target.lPitch = Math.sin(t * 11) * 0.6;
        target.rPitch = Math.cos(t * 13) * 0.6;
        break;
      case 'down': {
        const twitch = Math.sin(t * 25) * 0.15;
        target.lDown = target.rDown = 0.25 + twitch;
        target.lPitch = target.rPitch = -0.2;
        target.spread = 0.25;
        target.lKnee = 0.2 + twitch;
        target.rKnee = 0.3 - twitch;
        target.lean = 0;
        target.headYaw = 0.45;
        target.headPitch = -0.2;
        break;
      }
      case 'dunk': {
        // MONSTER DUNK: both hands up and over the rim, legs tucked
        target.lPitch = target.rPitch = -3.05;
        target.lDown = target.rDown = 1.22;
        target.lElbow = target.rElbow = 0.12;
        target.headPitch = -0.35;
        target.headYaw = 0;
        target.lean = 0.12;
        const total = s.dunkJump + s.dunkHang,
          e = total - p.timer;
        const swing =
          e > s.dunkJump ? Math.sin((e - s.dunkJump) * 7) * Math.exp(-(e - s.dunkJump) * 2) : 0;
        target.lKnee = 0.9 + swing * 0.4;
        target.rKnee = 0.7 - swing * 0.4;
        target.lSwing = target.rSwing = 0.35 + swing * 0.3;
        break;
      }
    }

    // jab step: lead foot steps out toward the fake, shoulders and head sell it, pivot foot stays planted
    const jabE = p.jab > 0 ? Math.sin(Math.PI * (1 - p.jab / config.handling.jabDuration)) : 0;
    if (jabE > 0) {
      const jabLx = p.jabX * Math.cos(p.angle) - p.jabZ * Math.sin(p.angle);
      const jabLz = p.jabX * Math.sin(p.angle) + p.jabZ * Math.cos(p.angle);
      const step = (0.35 + 0.5 * Math.max(0, jabLz)) * jabE;
      if (jabLx >= 0) {
        target.lSwing += step;
        target.lKnee += 0.35 * jabE;
      } else {
        target.rSwing += step;
        target.rKnee += 0.35 * jabE;
      }
      target.spread += Math.abs(jabLx) * 0.25 * jabE;
      target.lean += 0.22 * jabE;
      target.twist += jabLx * 0.45 * jabE;
      target.headYaw += jabLx * 0.35 * jabE;
      target.crouch += 0.06 * jabE;
    }
    // defender bites on the fake: lunges, reaches, off balance
    if (p.bite > 0) {
      const e = Math.sin(Math.PI * (1 - p.bite / config.handling.jabBite));
      const bx = p.biteX * Math.cos(p.angle) - p.biteZ * Math.sin(p.angle);
      target.lean += 0.3 * e;
      target.twist += bx * 0.5 * e;
      target.crouch += 0.08 * e;
      if (bx >= 0) {
        target.lPitch = -1.4 * e;
        target.lDown = 0.9;
      } else {
        target.rPitch = -1.4 * e;
        target.rDown = 0.9;
      }
    }

    // ---------- smooth + apply ----------
    const k = dampingFactor(
      p.mode === 'dunk' || p.mode === 'shoot' || p.jab > 0 || p.bite > 0 ? 24 : 14,
      dt,
    );
    const pose = st.pose as Pose;
    for (const key in target) {
      const kk = key as keyof Pose;
      pose[kk] += (target[kk] - pose[kk]) * k;
    }

    drive(rig, 'LeftArm', pose.lPitch, -pose.lIn, -pose.lDown, 'YXZ');
    drive(rig, 'RightArm', pose.rPitch, pose.rIn, pose.rDown, 'YXZ');
    drive(rig, 'LeftForeArm', 0, -pose.lElbow, 0);
    drive(rig, 'RightForeArm', 0, pose.rElbow, 0);
    drive(rig, 'LeftUpLeg', -pose.lSwing, 0, pose.spread);
    drive(rig, 'RightUpLeg', -pose.rSwing, 0, -pose.spread);
    drive(rig, 'LeftLeg', pose.lKnee, 0, 0);
    drive(rig, 'RightLeg', pose.rKnee, 0, 0);
    const ankleCompensation = 0.5 + pose.footPlant * 0.5;
    drive(rig, 'LeftFoot', -(pose.lKnee - pose.lSwing) * ankleCompensation, 0, 0);
    drive(rig, 'RightFoot', -(pose.rKnee - pose.rSwing) * ankleCompensation, 0, 0);
    drive(rig, 'Spine', pose.lean * 0.4, pose.twist * 0.3, 0);
    drive(rig, 'Spine1', pose.lean * 0.3, pose.twist * 0.3, 0);
    drive(rig, 'Spine2', pose.lean * 0.3, pose.twist * 0.4, 0);
    drive(rig, 'Head', pose.headPitch, pose.headYaw, 0, 'YXZ');
    if (rig.bones.Hips) {
      rig.bones.Hips.position.copy(rig.hipsRestPosition);
      rig.bones.Hips.position.y -= pose.crouch;
    }

    // ---------- root: facing, fall, stun wobble, dunk lift ----------
    turn.current.rotation.y = p.angle;
    st.downS += ((p.mode === 'down' ? 1 : 0) - st.downS) * dampingFactor(12, dt);
    fall.current.rotation.x = (st.downS * Math.PI) / 2;
    fall.current.position.y = rig.hipH - st.downS * (rig.hipH - 0.24);
    fall.current.rotation.z = p.mode === 'stun' ? Math.sin(t * 22) * 0.13 : 0;

    if (p.mode === 'dunk') {
      let liftY: number, offX: number, offZ: number;
      const total = s.dunkJump + s.dunkHang,
        e = total - p.timer;
      const d = Math.hypot(rimDx, rimDz) || 1;
      // body hangs just in front of the grip point; the grip follows the bending rim
      const gx = hoop.gripWorld.x - (rimDx / d) * 0.3,
        gz = hoop.gripWorld.z - (rimDz / d) * 0.3;
      const hangLift = Math.max(0, hoop.gripWorld.y - rig.reach);
      if (e < s.dunkJump) {
        const u = e / s.dunkJump,
          ease = 1 - (1 - u) * (1 - u);
        liftY = (hangLift + 0.3) * ease;
        offX = (gx - p.x) * ease;
        offZ = (gz - p.z) * ease;
      } else {
        const h = e - s.dunkJump;
        liftY = hangLift + Math.sin(h * 7) * 0.05 * Math.exp(-h * 2);
        offX = gx - p.x;
        offZ = gz - p.z;
        fall.current.rotation.x = Math.sin(h * 7) * 0.12 * Math.exp(-h * 2);
      }
      st.liftY = liftY;
      st.offX = offX;
      st.offZ = offZ;
    } else {
      // drop back to the floor
      const g = dampingFactor(9, dt);
      st.liftY += (0 - st.liftY) * g;
      st.offX += (0 - st.offX) * g;
      st.offZ += (0 - st.offZ) * g;
    }
    lift.current.position.set(
      st.offX + p.jabX * 0.14 * jabE,
      st.liftY,
      st.offZ + p.jabZ * 0.14 * jabE,
    );
    if (floor.current && groundFeet && p.mode !== 'dunk' && st.liftY < 0.001 && st.downS < 0.001) {
      // Ground upright poses, including the transition into/out of post. Airborne and
      // fallen animations keep their own root motion. This runs before updating the grip.
      floor.current.getWorldPosition(groundPoint);
      groundFeet(groundPoint.y);
      if (st.gaitWeight > 0.001 && p.mode !== 'down' && p.mode !== 'spin' && p.mode !== 'shoot') {
        forward.set(Math.sin(p.angle), 0, Math.cos(p.angle));
        for (let side = 0; side < legs.length; side++) {
          const leg = legs[side];
          if (!leg) continue;
          const step = sampleFootstep(
            st.phase + side * 0.5,
            stride,
            p.mode === 'post' ? config.animation.postFootLift : config.animation.walkFootLift,
          );
          leg.foot.getWorldPosition(footTarget);
          footTarget.x += st.directionX * step.travel * st.gaitWeight;
          footTarget.z += st.directionZ * step.travel * st.gaitWeight;
          footTarget.y += step.lift * st.gaitWeight;
          leg.solve(footTarget, forward);
        }
        groundFeet(groundPoint.y);
      }
    }
    if (blob.current) {
      const sc = (1.15 + st.downS * 0.9) / (1 + st.liftY * 0.6);
      blob.current.scale.set(sc, sc * (1 + st.downS), 1);
      blob.current.rotation.z = -p.angle;
      blob.current.position.set(st.offX, 0.012, st.offZ);
    }

    // The ball controller owns the target; hands only consume its rendered world position.
    // Rapier interpolation has already updated the ball and character parents this frame.
    model.updateWorldMatrix(true, true);
    if (bodies.ballMesh) bodies.ballMesh.getWorldPosition(ballPoint);
    else ballPoint.set(duel.ball.x, duel.ball.y, duel.ball.z);
    floor.current!.getWorldPosition(groundPoint);
    const bodyPoint = bodies.players[index]?.translation() ?? { x: p.x, y: bodyY, z: p.z };
    protectedBallTarget(legend, bodyPoint, p.angle, p.mode === 'post', catchPoint);
    const controlled = owner && duel.ballState === 'held' && p.mode !== 'down' && p.mode !== 'stun';
    const incoming = awaitingPass && duel.ballState === 'pass';
    incomingPoint
      .copy(catchPoint)
      .lerp(
        ballPoint,
        1 -
          smoothUnit((ballPoint.distanceTo(catchPoint) - config.inbound.passing.catchRadius) / 0.4),
      );
    hands.update(
      incoming ? incomingPoint : ballPoint,
      controlled,
      incoming,
      controlled && p.handling === 'dribble' && p.charge === 0,
      duel.ballControl,
      groundPoint,
      p.angle,
      Math.min(rawDt, 0.25),
    );
    model.updateWorldMatrix(true, true);
    // Compatibility diagnostic, never used as an attachment target by the ball controller.
    const gripPoint = controlled ? ballPoint : catchPoint;
    p.grip.x = gripPoint.x;
    p.grip.y = gripPoint.y;
    p.grip.z = gripPoint.z;
    p.grip.ok = controlled || incoming;
    p.gripOffset.x = gripPoint.x - bodyPoint.x;
    p.gripOffset.y = gripPoint.y - bodyPoint.y;
    p.gripOffset.z = gripPoint.z - bodyPoint.z;

    // ---------- face: blinks, gaze, jaw ----------
    if (t > st.blinkAt) {
      st.blink = 1;
      st.blinkAt = t + 2.2 + ((index * 7919 + Math.floor(t * 13)) % 30) / 10;
    }
    st.blink = Math.max(0, st.blink - dt * 7);
    const blink = p.mode === 'down' || p.mode === 'stun' ? 0.7 : Math.sin(st.blink * Math.PI);
    st.gx += (clamp(look * 1.4, -1, 1) - st.gx) * dampingFactor(10, dt);
    st.gy += (clamp((duel.ball.y - rig.headY) * 0.6, -1, 1) - st.gy) * dampingFactor(10, dt);
    const talking =
      duel.speaker === index && t < duel.messageUntil - config.effects.textDuration + 1.2;
    const jawTarget =
      p.mode === 'dunk'
        ? 0.85
        : p.mode === 'down'
          ? 0.45 + Math.sin(t * 9) * 0.1
          : p.mode === 'stun'
            ? 0.5
            : talking
              ? 0.2 + Math.abs(Math.sin(t * 13)) * 0.35
              : exhausted
                ? 0.3 + Math.sin(t * 7) * 0.15
                : p.charge > 0
                  ? 0.12
                  : 0;
    st.jaw += (jawTarget - st.jaw) * dampingFactor(18, dt);
    st.face.blinkLeft = st.face.blinkRight = blink;
    st.face.jawOpen = st.jaw;
    st.face.gazeX = st.gx;
    st.face.gazeY = st.gy;
    face(st.face);
  }, -50);

  return (
    <group ref={floor} name={`character-${index}`} position-y={-bodyY}>
      <mesh ref={blob} rotation-x={-Math.PI / 2} position-y={0.012} renderOrder={1}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial map={shadowTexture} transparent depthWrite={false} opacity={0.85} />
      </mesh>
      <HandContactDebug arms={hands.arms} />
      <group ref={lift}>
        <group ref={turn}>
          <group ref={fall} position-y={rig.hipH}>
            <primitive object={model} position-y={-rig.hipH} dispose={null} />
          </group>
        </group>
      </group>
    </group>
  );
}
