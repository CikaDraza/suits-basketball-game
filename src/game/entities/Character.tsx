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
import { contactArm } from './locomotion';
import { createHandContactPose } from './handContactPose';
import { protectedBallTarget, smoothUnit } from '../simulation/ballHandling';
import { HandContactDebug } from './HandContactDebug';
import { createLegRig } from './legRig';
import { createGaitState, stepGait, type GaitTuning } from './gait';
import { deriveStates, type CallForPassFallback } from './posture';
import { locomotionDebug } from './locomotionDebug';

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
  _qy = new Quaternion(),
  _e = new Euler(),
  _up = new Vector3(0, 1, 0);
/**
 * Rotate a bone by R, expressed in rest-pose model axes (+X = character's left, +Y up,
 * +Z forward). Every frame starts again from the bind pose, so nothing accumulates.
 */
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

/** Upper-body / leg FK parameters (radians), smoothed toward a target each frame. */
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
  /** leg FK: only used while airborne/fallen; grounded legs are solved by foot IK */
  lSwing: number;
  lKnee: number;
  rSwing: number;
  rKnee: number;
  spread: number;
  lean: number;
  twist: number;
  headYaw: number;
  headPitch: number;
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
};
const DEG = Math.PI / 180;
const G = config.animation.gait,
  PO = config.animation.posture;
const GAIT_TUNING: GaitTuning = {
  startSpeed: G.startSpeed,
  stopSpeed: G.stopSpeed,
  sector: G.sectorDeg * DEG,
  sectorMargin: G.sectorMarginDeg * DEG,
  settleDistance: G.settleDistance,
  settleYaw: G.settleYaw,
  settleDuration: G.settleDuration,
  settleLift: G.settleLift,
  maxStanceOffset: 0.5,
  minFootGap: G.minFootGap,
  startDistance: G.startDistance,
};

/**
 * Pelvis drop as a fraction of the rest hip height: ONE value per posture (max, not sum),
 * plus walking knee flexion that grows with pace, bracing and the exhausted slump.
 */
function postureDrop(
  st: {
    wHold: number;
    wDefensive: number;
    wPost: number;
    brace: number;
    wExhausted: number;
    moveWeight: number;
  },
  pace: number,
): number {
  return (
    PO.uprightDrop +
    Math.max(
      (PO.holdDrop - PO.uprightDrop) * st.wHold,
      (PO.defensiveDrop - PO.uprightDrop) * st.wDefensive,
      (PO.postDrop - PO.uprightDrop) * st.wPost,
      PO.movingDrop * st.moveWeight * pace,
    ) +
    PO.braceDrop * st.brace +
    PO.exhaustedDrop * st.wExhausted
  );
}

interface CharacterProps {
  readonly index: PlayerSlot;
  readonly legend: Legend;
}

/** Rigged GLB characters. Each clone owns its skeleton; geometry/materials belong to the loader cache. */
export function Character({ index, legend }: CharacterProps) {
  const gltf = useGLTF(MODEL_PATHS[legend]);
  const { model, rig, face, skeletons, groundFeet, legRig, hands } = useMemo(() => {
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
      // measured in the detached bind pose, before any posing
      legRig: createLegRig(model, rig.bones),
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
      locomotionDebug[index] = null;
    },
    [skeletons, index],
  );

  const state = useRef({
    pose: { ...REST },
    gait: createGaitState(),
    groundReady: false,
    lastGround: new Vector3(),
    revision: -1,
    moveWeight: 0,
    wPost: 0,
    wDefensive: 0,
    wHold: 0,
    wExhausted: 0,
    brace: 0,
    lastCut: -Infinity,
    velX: 0,
    velZ: 0,
    netX: 0,
    netZ: 0,
    resets: 0,
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
  const ballPoint = useMemo(() => new Vector3(), []);
  const catchPoint = useMemo(() => new Vector3(), []);
  const incomingPoint = useMemo(() => new Vector3(), []);
  const scratch = useMemo(
    () => ({
      neutral: [new Vector3(), new Vector3()] as [Vector3, Vector3],
      hip: new Vector3(),
      ankle: new Vector3(),
      pole: new Vector3(),
      footWorld: new Quaternion(),
    }),
    [],
  );

  useFrame((_, rawDt) => {
    if (!isSimulationRunning()) return;
    const st = state.current;
    // pose smoothing uses a clamped step; MOTION measurements use the real frame time
    // (clamping it would double the measured speed and flag ordinary 5–10 fps frames as
    // teleports, which would reset the planted feet)
    const dt = Math.min(rawDt, 0.05);
    const frameDt = Math.min(rawDt, 0.25);
    const p = duel.players[index];
    if (!p || !lift.current || !turn.current || !fall.current || !floor.current) return;
    const t = duel.time,
      s = config.shots;
    const body = bodies.players[index];
    const owner = duel.owner === index;
    const opponent = duel.players[1 - index];
    const exhausted = p.energy < config.player.exhaustedThreshold;
    const rimDx = hoop.rimWorld.x - p.x,
      rimDz = hoop.rimWorld.z - p.z;
    const fx = Math.sin(p.angle),
      fz = Math.cos(p.angle);
    const lx = fz,
      lz = -fx; // character's left in world space

    // ---------- 1. derived states (no second state machine) ----------
    const awaitingPass =
      (duel.ballState === 'inbound' || duel.ballState === 'pass') && duel.inboundOwner === index;
    const receiving =
      awaitingPass &&
      duel.ballState === 'pass' &&
      Math.hypot(duel.ball.x - p.x, duel.ball.z - p.z) < config.animation.catchReadyDistance;
    const controlled = owner && duel.ballState === 'held' && p.mode !== 'down' && p.mode !== 'stun';
    // Measured horizontal velocity = the body's actual displacement, smoothed. Rapier's
    // linvel after the solver can still report the pushing intent when an opponent is
    // shoved and clamped back each step (a blocked player would "walk in place").
    const velocity = { x: st.velX, z: st.velZ };
    const measuredSpeed = Math.hypot(velocity.x, velocity.z);
    if (awaitingPass && measuredSpeed > config.animation.callForPass.cutSpeed) st.lastCut = t;
    const opponentDistance = Math.hypot(opponent.x - p.x, opponent.z - p.z);
    const states = deriveStates({
      mode: p.mode,
      controlled,
      handling: p.handling,
      receiving,
      ballState: duel.ballState,
      inboundOwner: duel.inboundOwner,
      inboundStage: duel.inboundStage,
      slot: index,
      opponentHasBall: duel.owner === 1 - index && duel.ballState === 'held',
      opponentDistance,
      guardRange: config.defense.guardRange,
      sinceRequest: t - p.passRequestAt,
      sinceCut: t - st.lastCut,
      callForPass: {
        fallback: config.animation.callForPass.fallback as CallForPassFallback,
        requestHold: config.animation.callForPass.requestHold,
        cutHold: config.animation.callForPass.cutHold,
      },
    });
    const blendK = dampingFactor(PO.blendRate, dt);
    st.wPost += ((states.posture === 'post' ? 1 : 0) - st.wPost) * blendK;
    st.wDefensive += ((states.posture === 'defensive' ? 1 : 0) - st.wDefensive) * blendK;
    st.wHold += ((states.upper === 'hold' && p.charge === 0 ? 1 : 0) - st.wHold) * blendK;
    st.wExhausted +=
      ((exhausted && p.mode === 'idle' && !st.gait.moving ? 1 : 0) - st.wExhausted) * blendK;
    // brace: pushing against a blocking opponent without actually travelling
    // pushing: the player intends to move, is in contact, and achieves (net, jitter-free)
    // well under a third of the intended speed — a blocked player braces, not walks
    const netSpeed = Math.hypot(st.netX, st.netZ);
    const pushing =
      p.moving > config.player.minMove &&
      netSpeed < p.moving * config.player[legend].speed * PO.braceSpeedRatio &&
      opponentDistance < config.physics.radius * 2 + config.animation.contactReach;
    st.brace += ((pushing ? 1 : 0) - st.brace) * dampingFactor(6, dt);

    // ---------- 2. gait from the body's measured travel and (smoothed) velocity ----------
    floor.current.getWorldPosition(groundPoint);
    const grounded = p.mode !== 'dunk' && st.liftY < 0.001 && st.downS < 0.001;
    const travelX = groundPoint.x - st.lastGround.x,
      travelZ = groundPoint.z - st.lastGround.z;
    const reset =
      !st.groundReady ||
      st.revision !== duel.revision ||
      Math.hypot(travelX, travelZ) > config.animation.teleportDistance ||
      // more travel in one frame than a step can cover (a long frame hitch): re-plant the
      // feet under the body instead of dragging them through an unreachable IK target
      Math.hypot(travelX, travelZ) > G.snapDistance ||
      // faster than any player can move: a teleport/reset, not a step
      Math.hypot(travelX, travelZ) >
        config.animation.maxPlausibleSpeed * Math.max(frameDt, 1 / 60) ||
      p.mode === 'spin';
    if (reset && st.groundReady) st.resets++;
    st.lastGround.copy(groundPoint);
    st.revision = duel.revision;
    const vk = reset ? 1 : dampingFactor(G.velocitySmoothing, frameDt);
    st.velX += ((reset ? 0 : travelX / Math.max(frameDt, 1e-3)) - st.velX) * vk;
    st.velZ += ((reset ? 0 : travelZ / Math.max(frameDt, 1e-3)) - st.velZ) * vk;
    velocity.x = st.velX;
    velocity.z = st.velZ;
    const nk = reset ? 1 : dampingFactor(G.netSmoothing, frameDt);
    st.netX += ((reset ? 0 : travelX / Math.max(frameDt, 1e-3)) - st.netX) * nk;
    st.netZ += ((reset ? 0 : travelZ / Math.max(frameDt, 1e-3)) - st.netZ) * nk;
    const gait = st.gait;
    const spread =
      PO.holdSpread * st.wHold +
      Math.max(PO.defensiveSpread * st.wDefensive, PO.postSpread * st.wPost);
    let stride = 0;
    if (legRig && grounded) {
      for (let i = 0; i < 2; i++) {
        const leg = legRig.legs[i],
          sign = i === 0 ? 1 : -1;
        const x = leg.restFoot.x + sign * spread,
          z = leg.restFoot.z;
        scratch.neutral[i].set(
          groundPoint.x + lx * x + fx * z,
          groundPoint.y + leg.ankleHeight,
          groundPoint.z + lz * x + fz * z,
        );
      }
      // stride/lift blended by travel direction in the facing frame, then by posture
      const sp = Math.max(gait.speed, 1e-6);
      const fw = Math.max(0, gait.forwardSpeed) ** 2 / sp ** 2,
        bw = Math.max(0, -gait.forwardSpeed) ** 2 / sp ** 2,
        sw = gait.sideSpeed ** 2 / sp ** 2;
      const norm = fw + bw + sw || 1;
      let strideF = (fw * G.stride.forward + bw * G.stride.backward + sw * G.stride.strafe) / norm;
      let liftH = (fw * G.lift.forward + bw * G.lift.backward + sw * G.lift.strafe) / norm;
      strideF += (G.stride.defensive - strideF) * st.wDefensive;
      liftH += (G.lift.defensive - liftH) * st.wDefensive;
      strideF += (G.stride.post - strideF) * st.wPost;
      liftH += (G.lift.post - liftH) * st.wPost;
      const pace = clamp(gait.speed / config.player[legend].speed, 0, 1);
      stride = legRig.legLength * strideF * (G.slowStrideScale + (1 - G.slowStrideScale) * pace);
      // a planted foot is replanted before it leaves the leg's real horizontal reach at the
      // posture's pelvis height (otherwise the pelvis would have to squat to keep contact)
      const thighY =
        legRig.thighHeight - rig.hipH * postureDrop(st, pace) - legRig.legs[0].ankleHeight;
      const reachRadius = Math.sqrt(
        Math.max(0, (legRig.legLength * PO.reachSlack) ** 2 - thighY * thighY),
      );
      GAIT_TUNING.maxStanceOffset = Math.max(
        0.12,
        Math.min(stride * 0.5 + G.overreach, reachRadius * 0.9),
      );
      stepGait(
        gait,
        {
          dt: frameDt,
          travelX,
          travelZ,
          velocityX: velocity.x,
          velocityZ: velocity.z,
          netSpeed: Math.hypot(st.netX, st.netZ),
          bodyX: groundPoint.x,
          bodyZ: groundPoint.z,
          angle: p.angle,
          neutral: scratch.neutral,
          step: { stride, lift: liftH },
          reset,
        },
        GAIT_TUNING,
      );
      st.groundReady = true;
    } else st.groundReady = false;
    st.moveWeight += ((gait.moving ? 1 : 0) - st.moveWeight) * dampingFactor(10, dt);
    const mv = st.moveWeight * clamp(gait.speed / config.player[legend].speed, 0, 1);
    const along = gait.speed > 1e-3 ? gait.forwardSpeed / gait.speed : 0; // +1 fwd, −1 back

    hands.reset();
    // ---------- 3. upper-body + spine target pose (rebuilt from REST every frame) ----------
    Object.assign(target, REST);
    // arm swing counter to the legs (left arm forward while the left foot is back)
    const swing = Math.cos(gait.phase * Math.PI * 2) * G.armSwing * mv * Math.abs(along);
    target.lPitch = swing;
    target.rPitch = -swing;
    target.lElbow = target.rElbow = 0.25 + 0.2 * mv;
    target.lean =
      0.04 +
      (along > 0 ? 0.1 * mv : -0.04 * mv) +
      Math.sin(t * (exhausted ? 7 : 3)) * (exhausted ? 0.04 : 0.012);

    // look at the ball (head yaw in local frame); chest follows within anatomical limits
    const bx = duel.ball.x - p.x,
      bz = duel.ball.z - p.z;
    const ballLocalX = bx * Math.cos(p.angle) - bz * Math.sin(p.angle),
      ballLocalZ = bx * Math.sin(p.angle) + bz * Math.cos(p.angle);
    const look = Math.atan2(ballLocalX, Math.max(0.2, ballLocalZ));
    const lookFull = Math.atan2(ballLocalX, ballLocalZ);
    const ballSide = ballLocalX >= 0 ? 1 : -1; // +1 = ball on the character's left
    target.headYaw = clamp(look * 0.55, -0.7, 0.7);
    target.headPitch = clamp(
      (-(duel.ball.y - rig.headY) / Math.max(1, Math.hypot(bx, bz))) * 0.4,
      -0.45,
      0.35,
    );

    switch (states.upper) {
      case 'hold':
        if (p.charge === 0 && p.mode !== 'post' && p.mode !== 'spin') {
          // triple threat FK base (hand IK owns the final arm pose)
          target.lPitch = target.rPitch = -0.6;
          target.lDown = target.rDown = 1.3;
          target.lElbow = target.rElbow = 1.15;
          target.lIn = target.rIn = 0.45;
          target.lean = 0.14;
        }
        break;
      case 'callForPass': {
        // one hand up on the ball side, chest and eyes on the passer
        const up = ballSide > 0;
        if (up) {
          target.lPitch = -2.5;
          target.lDown = 1.1;
          target.lElbow = 0.35;
        } else {
          target.rPitch = -2.5;
          target.rDown = 1.1;
          target.rElbow = 0.35;
        }
        target.twist = clamp(lookFull * 0.4, -0.35, 0.35);
        target.headYaw = clamp(lookFull * 0.6, -0.9, 0.9);
        break;
      }
      case 'relaxed':
        if (awaitingPass) {
          // off-ball receiver: relaxed arms, chest/head toward the actual ball
          target.twist = clamp(lookFull * 0.35, -0.3, 0.3);
          target.headYaw = clamp(lookFull * 0.6, -0.9, 0.9);
        }
        break;
      case 'deny': {
        // ball-side arm into the passing lane; the other arm bent on the receiver
        const laneLeft = ballSide > 0;
        // (down 1.3 = hanging, 0 = straight out to the side; pitch < 0 raises forward)
        const lane = { pitch: -1.3, down: 1.0, elbow: 0.35 },
          bar = { pitch: -0.75, down: 1.1, elbow: 1.2 };
        const l = laneLeft ? lane : bar,
          r = laneLeft ? bar : lane;
        target.lPitch = l.pitch;
        target.lDown = l.down;
        target.lElbow = l.elbow;
        target.rPitch = r.pitch;
        target.rDown = r.down;
        target.rElbow = r.elbow;
        target.twist = clamp(lookFull * 0.3, -0.3, 0.3);
        target.headYaw = clamp(lookFull * 0.65, -1.0, 1.0);
        target.lean = 0.2;
        break;
      }
      case 'guard': {
        // on-ball: low, arms moderately spread and bent, ball-side hand a little higher
        const high = { pitch: -1.2, down: 1.05, elbow: 0.85 },
          low = { pitch: -0.6, down: 1.1, elbow: 1.0 };
        const l = ballSide > 0 ? high : low,
          r = ballSide > 0 ? low : high;
        target.lPitch = l.pitch;
        target.lDown = l.down;
        target.lElbow = l.elbow;
        target.rPitch = r.pitch;
        target.rDown = r.down;
        target.rElbow = r.elbow;
        target.lean = 0.24;
        break;
      }
      default:
        break;
    }
    if (st.wExhausted > 0.5) {
      // hands on knees, sucking air
      target.lean = 0.5 + Math.sin(t * 7) * 0.04;
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
        // knees/pelvis come from the posture height + foot IK; this is arms + torso only
        target.lean = 0.38;
        if (p.charge === 0) {
          target.lDown = target.rDown = 0.85;
          target.lPitch = target.rPitch = -0.45;
          target.lElbow = target.rElbow = 1.6;
        }
        if (awaitingPass) {
          const gx = opponent.x - p.x,
            gz = opponent.z - p.z;
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

    // jab step: shoulders and head sell it; the lead foot steps out via IK (pivot stays planted)
    const jabE = p.jab > 0 ? Math.sin(Math.PI * (1 - p.jab / config.handling.jabDuration)) : 0;
    const jabLx = p.jabX * Math.cos(p.angle) - p.jabZ * Math.sin(p.angle);
    if (jabE > 0) {
      target.lean += 0.22 * jabE;
      target.twist += jabLx * 0.45 * jabE;
      target.headYaw += jabLx * 0.35 * jabE;
    }
    // defender bites on the fake: lunges, reaches, off balance
    if (p.bite > 0) {
      const e = Math.sin(Math.PI * (1 - p.bite / config.handling.jabBite));
      const biteX = p.biteX * Math.cos(p.angle) - p.biteZ * Math.sin(p.angle);
      target.lean += 0.3 * e;
      target.twist += biteX * 0.5 * e;
      if (biteX >= 0) {
        target.lPitch = -1.4 * e;
        target.lDown = 0.9;
      } else {
        target.rPitch = -1.4 * e;
        target.rDown = 0.9;
      }
    }
    // posture lean: low defensive stance; bracing leans into the blocker
    target.lean +=
      0.18 * st.wDefensive * (states.upper === 'guard' || states.upper === 'deny' ? 0 : 1);
    if (st.brace > 0.01) {
      const behind = (opponent.x - p.x) * fx + (opponent.z - p.z) * fz < 0;
      target.lean += (behind ? -1 : 1) * PO.braceLean * st.brace;
    }

    // ---------- 4. smooth + apply FK (rotations rebuilt from the bind pose) ----------
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
    drive(rig, 'LeftFoot', -(pose.lKnee - pose.lSwing) * 0.5, 0, 0);
    drive(rig, 'RightFoot', -(pose.rKnee - pose.rSwing) * 0.5, 0, 0);
    drive(rig, 'Spine', pose.lean * 0.4, pose.twist * 0.3, 0);
    drive(rig, 'Spine1', pose.lean * 0.3, pose.twist * 0.3, 0);
    drive(rig, 'Spine2', pose.lean * 0.3, pose.twist * 0.4, 0);
    drive(rig, 'Head', pose.headPitch, pose.headYaw, 0, 'YXZ');
    if (rig.bones.Hips) rig.bones.Hips.position.copy(rig.hipsRestPosition);

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
    // a small upper-body "sell" toward the jab; the feet stay on their IK targets
    lift.current.position.set(
      st.offX + p.jabX * 0.08 * jabE,
      st.liftY,
      st.offZ + p.jabZ * 0.08 * jabE,
    );

    // ---------- 5. pelvis height + grounded foot IK ----------
    let pelvisDrop = 0,
      reachDrop = 0;
    if (legRig && grounded && st.groundReady) {
      model.updateWorldMatrix(true, true);
      const sc = scratch;
      // jab: the lead (non-pivot) foot steps out toward the fake
      if (jabE > 0) {
        const lead = jabLx >= 0 ? 0 : 1;
        const foot = gait.feet[lead].target;
        foot.x += p.jabX * 0.3 * jabE;
        foot.z += p.jabZ * 0.3 * jabE;
        foot.y += 0.05 * jabE;
      }
      // posture height: one controlled drop (no stacked crouch/knee/grounding offsets)
      pelvisDrop =
        postureDrop(st, clamp(gait.speed / config.player[legend].speed, 0, 1)) +
        // two small dips per cycle, at mid-stance
        G.bob * st.moveWeight * 0.5 * (1 - Math.cos(gait.phase * Math.PI * 4));
      const hips = legRig.hips;
      hips.getWorldPosition(sc.hip);
      const sway = PO.braceSway * st.brace * Math.sin(t * 2.4);
      legRig.shiftPelvis(
        lx * sway,
        groundPoint.y + rig.hipH * (1 - pelvisDrop) - sc.hip.y,
        lz * sway,
      );
      // if a foot target is out of reach, lower the pelvis just enough (bone lengths kept)
      for (let i = 0; i < 2; i++) {
        const leg = legRig.legs[i];
        leg.thigh.getWorldPosition(sc.hip);
        const reach = leg.length * PO.reachSlack;
        const tg = gait.feet[i].target;
        const horizontal = Math.hypot(tg.x - sc.hip.x, tg.z - sc.hip.z);
        const need =
          horizontal >= reach
            ? sc.hip.y - tg.y
            : sc.hip.y - (tg.y + Math.sqrt(reach * reach - horizontal * horizontal));
        reachDrop = Math.max(reachDrop, need);
      }
      // bounded: an out-of-reach target is a gait bug, not a reason to squat (it is reported)
      if (reachDrop > 0) legRig.shiftPelvis(0, -Math.min(reachDrop, PO.maxReachDrop), 0);
      for (let i = 0; i < 2; i++) {
        const leg = legRig.legs[i],
          foot = gait.feet[i],
          sign = i === 0 ? 1 : -1;
        // knees track forward and slightly out; the foot is flat with its planted yaw
        sc.pole.set(fx + lx * sign * 0.2, 0, fz + lz * sign * 0.2).normalize();
        sc.footWorld.copy(_qy.setFromAxisAngle(_up, foot.yaw)).multiply(leg.restFootQuat);
        leg.solve(foot.target, sc.pole, sc.footWorld);
      }
    } else if (groundFeet && p.mode !== 'dunk' && st.liftY < 0.001 && st.downS < 0.001) {
      // fallback for rigs without a measurable leg chain
      groundFeet(groundPoint.y);
    }
    locomotionDebug[index] = {
      locomotion: gait.locomotion,
      posture: states.posture,
      upper: states.upper,
      moving: gait.moving,
      speed: gait.speed,
      forwardSpeed: gait.forwardSpeed,
      sideSpeed: gait.sideSpeed,
      phase: gait.phase,
      steps: gait.steps,
      resets: st.resets,
      brace: st.brace,
      pelvisDrop,
      reachDrop,
      stride,
      grounded: grounded && st.groundReady,
      feet: gait.feet.map((f, i) => ({
        planted: !f.swinging,
        target: { x: f.target.x, y: f.target.y, z: f.target.z },
        neutral: {
          x: scratch.neutral[i].x,
          y: scratch.neutral[i].y,
          z: scratch.neutral[i].z,
        },
        lift: f.lift,
        yaw: f.yaw,
      })),
    };
    if (blob.current) {
      const sc = (1.15 + st.downS * 0.9) / (1 + st.liftY * 0.6);
      blob.current.scale.set(sc, sc * (1 + st.downS), 1);
      blob.current.rotation.z = -p.angle;
      blob.current.position.set(st.offX, 0.012, st.offZ);
    }

    // ---------- 6. hands: the ball controller owns the target (Slice 2) ----------
    // Hand IK runs after the body pose and owns the arms while holding/dribbling/catching.
    model.updateWorldMatrix(true, true);
    if (bodies.ballMesh) bodies.ballMesh.getWorldPosition(ballPoint);
    else ballPoint.set(duel.ball.x, duel.ball.y, duel.ball.z);
    const bodyPoint = body?.translation() ?? { x: p.x, y: bodyY, z: p.z };
    protectedBallTarget(legend, bodyPoint, p.angle, p.mode === 'post', catchPoint);
    // hands reach for the pass only once it is close: until then the call-for-pass arm
    // (or relaxed arms) stay visible; IK then owns both arms through the catch
    const incoming = receiving;
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
