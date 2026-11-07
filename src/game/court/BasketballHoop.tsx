import { useEffect, useMemo, useRef, type ReactNode, type RefObject } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { RigidBody, CuboidCollider, BallCollider, type RapierRigidBody } from '@react-three/rapier';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { COURT, HOOP, COLORS } from './constants';
import { createShadowTexture } from './courtGeometry';
import { stepSpring, applyRimAngularImpulse, HANG_COUPLING, hoop } from './hoopRig';
import { Net } from './Net';
import { bodies, duel } from '../entities/Duel';
import { config } from '../data/gameConfig';
import { isSimulationRunning } from '../simulation/isSimulationRunning';

// ---- derived geometry (meters, court space) ----
const {
  BASE_X,
  BASE_TOP,
  LOWER_ARM_LEN: ARM1,
  LOWER_ARM_TILT: TILT1,
  MOUNT,
  BOARD_W,
  BOARD_H,
  BOARD_BOTTOM,
} = HOOP;
const H2X = BASE_X - ARM1 * Math.sin(TILT1),
  H2Y = BASE_TOP + ARM1 * Math.cos(TILT1);
const ARM2 = Math.hypot(MOUNT[0] - H2X, MOUNT[1] - H2Y);
const ARM2_ANG = Math.atan2(MOUNT[1] - H2Y, MOUNT[0] - H2X);
const TILT2 = ARM2_ANG - TILT1;
const FX = COURT.BOARD_X - MOUNT[0]; // glass plane in board space
const BY = BOARD_BOTTOM - MOUNT[1]; // board bottom edge
const BCY = BY + BOARD_H / 2;
const TB = COURT.RIM_Y - MOUNT[1]; // rim height in board space
const RIM_CX = COURT.BASKET_X - (COURT.BOARD_X + 0.006);
const RIM_BALLS = 24;
const STEP = 1 / 120;

const strut = (y1: number, z1: number, y2: number, z2: number) => ({
  len: Math.hypot(y2 - y1, z2 - z1),
  position: [FX - 0.035, (y1 + y2) / 2, (z1 + z2) / 2] as [number, number, number],
  rotX: -Math.atan2(y2 - y1, z2 - z1),
});
const STRUTS = [
  strut(BY + 0.05, -0.85, BY + 1.0, 0.85),
  strut(BY + 0.05, 0.85, BY + 0.62, -0.05),
  strut(BY + 0.62, -0.85, BY + 0.62, 0.85),
];

function useHoopMaterials() {
  const m = useMemo(
    () => ({
      pad: new THREE.MeshStandardMaterial({
        name: 'pad_red',
        color: COLORS.pad,
        roughness: 0.88,
        metalness: 0,
        flatShading: true,
      }),
      steel: new THREE.MeshStandardMaterial({
        name: 'steel_grey',
        color: COLORS.steel,
        roughness: 0.6,
        metalness: 0,
      }),
      glass: new THREE.MeshStandardMaterial({
        name: 'glass',
        color: COLORS.glass,
        roughness: 0.2,
        metalness: 0,
        transparent: true,
        opacity: 0.16,
        depthWrite: false,
      }),
      paint: new THREE.MeshStandardMaterial({
        name: 'line_paint',
        color: COLORS.line,
        roughness: 0.85,
        metalness: 0,
      }),
      rim: new THREE.MeshStandardMaterial({
        name: 'rim_orange',
        color: COLORS.rim,
        roughness: 0.5,
        metalness: 0,
      }),
      shadow: new THREE.MeshBasicMaterial({
        name: 'contact_shadow',
        map: createShadowTexture(),
        transparent: true,
        depthWrite: false,
      }),
    }),
    [],
  );
  useEffect(
    () => () => {
      Object.values(m).forEach((x) => {
        (x as THREE.MeshBasicMaterial).map?.dispose();
        x.dispose();
      });
    },
    [m],
  );
  return m;
}

function useHoopGeometries() {
  const g = useMemo(() => {
    const tower = new THREE.CylinderGeometry(0.3, 0.46, 1.5, 4, 1);
    tower.rotateY(Math.PI / 4).scale(1, 1, 0.86);
    // 12 net hooks merged into one mesh (one draw call)
    const hookParts = Array.from({ length: 12 }, (_, i) => {
      const a = (i / 12) * Math.PI * 2;
      return new THREE.BoxGeometry(0.012, 0.025, 0.006)
        .rotateY(-a)
        .translate(Math.cos(a) * COURT.RIM_RADIUS, -0.014, Math.sin(a) * COURT.RIM_RADIUS);
    });
    const hooks = mergeGeometries(hookParts, false)!;
    for (const part of hookParts) part.dispose();
    return {
      tower,
      hooks,
      knuckle: new THREE.CylinderGeometry(0.075, 0.075, 0.2, 24).rotateX(Math.PI / 2),
      ring: new THREE.TorusGeometry(COURT.RIM_RADIUS, COURT.RIM_TUBE, 12, 64),
    };
  }, []);
  useEffect(
    () => () => {
      Object.values(g).forEach((x) => x.dispose());
    },
    [g],
  );
  return g;
}

interface KinematicProxyProps {
  readonly anchor: RefObject<THREE.Object3D | null>;
  readonly part: string;
  readonly children: ReactNode;
}

/** Collider-only kinematic body that mirrors a node of the visual hierarchy (world space). */
function KinematicProxy({ anchor, part, children }: KinematicProxyProps) {
  const body = useRef<RapierRigidBody>(null);
  const transform = useMemo(
    () => ({
      position: new THREE.Vector3(),
      rotation: new THREE.Quaternion(),
      scale: new THREE.Vector3(),
    }),
    [],
  );
  useFrame(() => {
    if (!isSimulationRunning()) return;
    const a = anchor.current,
      b = body.current;
    if (!a || !b) return;
    a.updateWorldMatrix(true, false);
    a.matrixWorld.decompose(transform.position, transform.rotation, transform.scale);
    b.setNextKinematicTranslation(transform.position);
    b.setNextKinematicRotation(transform.rotation);
  }, -1);
  return (
    <RigidBody
      ref={body}
      type="kinematicPosition"
      colliders={false}
      userData={{ kind: 'hoop', part }}
      restitution={0.55}
      friction={0.6}
    >
      {children}
    </RigidBody>
  );
}

const BASE_WORLD: [number, number, number] = [BASE_X, 0, 0];

/**
 * Г-shaped portable hoop.
 *   SegmentA_Base (fixed) → Hinge1_LowerArm (0…−15°) → Hinge2_UpperArm (0…−45°) → Backboard → RimPivot_3Axis
 *   (rim: pitch down −0.55…0.03 rad, roll/yaw left-right ±0.22 rad)
 * Joint angles live in `hoop.rig` and spring back to rest every frame.
 */
export function BasketballHoop() {
  const M = useHoopMaterials();
  const G = useHoopGeometries();
  const hinge1 = useRef<THREE.Group>(null);
  const hinge2 = useRef<THREE.Group>(null);
  const board = useRef<THREE.Group>(null);
  const rimPivot = useRef<THREE.Group>(null);
  const rimCenter = useRef<THREE.Group>(null);

  const tmp = useMemo(
    () => ({
      acc: 0,
      c: new THREE.Vector3(),
      n: new THREE.Vector3(),
      v: new THREE.Vector3(),
      Q: new THREE.Vector3(),
      J: new THREE.Vector3(),
      piv: new THREE.Vector3(),
      tau: new THREE.Vector3(),
      q: new THREE.Quaternion(),
      bq: new THREE.Quaternion(),
      F: new THREE.Vector3(),
      lastHit: -1,
    }),
    [],
  );

  // Spring-back joint solver — runs before the proxies copy poses (priority -2 < -1).
  useFrame((_, delta) => {
    if (!isSimulationRunning()) return;
    if (
      !hinge1.current ||
      !hinge2.current ||
      !board.current ||
      !rimPivot.current ||
      !rimCenter.current
    )
      return;
    const rig = hoop.rig;
    rimPivot.current.getWorldPosition(tmp.piv);
    board.current.getWorldQuaternion(tmp.bq).invert();

    // 1) loose ball touching the ring → impulse at the nearest ring point
    const ball = bodies.ball;
    if (
      ball &&
      (duel.ballState === 'loose' || duel.ballState === 'scored') &&
      duel.time - tmp.lastHit > 0.06
    ) {
      const bp = ball.translation(),
        bv = ball.linvel();
      const { c, n, v, Q } = tmp;
      rimCenter.current.getWorldPosition(c);
      n.set(0, 1, 0).applyQuaternion(rimCenter.current.getWorldQuaternion(tmp.q));
      v.set(bp.x, bp.y, bp.z).sub(c);
      v.addScaledVector(n, -v.dot(n));
      if (v.lengthSq() > 1e-8) {
        Q.copy(c).addScaledVector(v.normalize(), COURT.RIM_RADIUS);
        const d = v.set(bp.x, bp.y, bp.z).sub(Q),
          dist = d.length();
        if (dist < config.ball.radius + COURT.RIM_TUBE + 0.02) {
          d.normalize();
          const vn = bv.x * d.x + bv.y * d.y + bv.z * d.z;
          if (vn < -0.3) {
            tmp.lastHit = duel.time;
            hoop.impulses.push({
              point: [Q.x, Q.y, Q.z],
              impulse: [d.x * vn * 0.6, d.y * vn * 0.6, d.z * vn * 0.6],
            });
          }
        }
      }
    }

    // 2) one-off impulses (rim clanks, dunk slam at the freshly placed grip)
    rimCenter.current.localToWorld(hoop.gripWorld.copy(hoop.hang.local));
    if (hoop.hang.slam > 0) {
      const g = hoop.gripWorld;
      hoop.impulses.push({ point: [g.x, g.y, g.z], impulse: [0, -hoop.hang.slam, 0] });
      hoop.hang.slam = 0;
    }
    for (const { point, impulse } of hoop.impulses) {
      tmp.tau
        .set(...point)
        .sub(tmp.piv)
        .cross(tmp.J.set(...impulse))
        .applyQuaternion(tmp.bq);
      applyRimAngularImpulse(rig, tmp.tau.x, tmp.tau.y, tmp.tau.z);
    }
    hoop.impulses.length = 0;

    // 3) sustained hang torque: player weight + arm pull at the grip point
    rimCenter.current.getWorldPosition(hoop.rimWorld);
    if (hoop.hang.remaining > 0) {
      tmp.F.set(0, -hoop.hang.force, 0);
      tmp.tau.copy(hoop.gripWorld).sub(tmp.piv).cross(tmp.F).applyQuaternion(tmp.bq);
      rig.rimX.ext = tmp.tau.x;
      rig.rimY.ext = tmp.tau.y;
      rig.rimZ.ext = tmp.tau.z;
      rig.hinge2.ext = tmp.tau.z * HANG_COUPLING.hinge2;
      rig.hinge1.ext = tmp.tau.z * HANG_COUPLING.hinge1;
    } else {
      rig.rimX.ext = rig.rimY.ext = rig.rimZ.ext = rig.hinge1.ext = rig.hinge2.ext = 0;
    }

    tmp.acc += Math.min(delta, 1 / 20);
    while (tmp.acc >= STEP) {
      tmp.acc -= STEP;
      if (hoop.hang.remaining > 0) hoop.hang.remaining -= STEP;
      stepSpring(rig.hinge1, STEP);
      stepSpring(rig.hinge2, STEP);
      stepSpring(rig.rimX, STEP);
      stepSpring(rig.rimY, STEP);
      stepSpring(rig.rimZ, STEP);
    }
    hinge1.current.rotation.z = TILT1 + rig.hinge1.angle;
    hinge2.current.rotation.z = TILT2 + rig.hinge2.angle;
    rimPivot.current.rotation.set(rig.rimX.angle, rig.rimY.angle, rig.rimZ.angle);
  }, -2);

  return (
    <>
      <group name="HoopVisual">
        {/* ---------------- visual hierarchy ---------------- */}
        <group name="BasketballHoop" position={[BASE_X, 0, 0]}>
          <group name="SegmentA_Base">
            <mesh name="base_plinth" material={M.pad} position={[0, 0.09, 0]}>
              <boxGeometry args={[1.0, 0.18, 0.84]} />
            </mesh>
            <mesh
              name="base_tower_pad"
              material={M.pad}
              geometry={G.tower}
              position={[0, 0.93, 0]}
            />
            <mesh name="base_cap" material={M.pad} position={[0, 1.7, 0]}>
              <boxGeometry args={[0.36, 0.04, 0.32]} />
            </mesh>

            <group
              ref={hinge1}
              name="Hinge1_LowerArm"
              position={[0, BASE_TOP, 0]}
              rotation-z={TILT1}
            >
              <mesh name="hinge1_knuckle" material={M.steel} geometry={G.knuckle} />
              <mesh name="lower_arm" material={M.steel} position={[0, ARM1 / 2, 0]}>
                <boxGeometry args={[0.15, ARM1, 0.13]} />
              </mesh>

              <group ref={hinge2} name="Hinge2_UpperArm" position={[0, ARM1, 0]} rotation-z={TILT2}>
                <mesh name="hinge2_knuckle" material={M.steel} geometry={G.knuckle} scale={0.93} />
                <mesh name="upper_arm" material={M.steel} position={[ARM2 / 2, 0, 0]}>
                  <boxGeometry args={[ARM2, 0.13, 0.12]} />
                </mesh>

                <group ref={board} name="Backboard" position={[ARM2, 0, 0]} rotation-z={-ARM2_ANG}>
                  <mesh name="board_mount" material={M.steel} position={[(FX - 0.01) / 2, 0, 0]}>
                    <boxGeometry args={[FX - 0.01, 0.22, 0.3]} />
                  </mesh>
                  <mesh name="glass" material={M.glass} position={[FX, BCY, 0]} renderOrder={2}>
                    <boxGeometry args={[0.012, BOARD_H, BOARD_W]} />
                  </mesh>
                  <mesh
                    name="frame_top"
                    material={M.steel}
                    position={[FX - 0.012, BY + BOARD_H, 0]}
                  >
                    <boxGeometry args={[0.035, 0.045, BOARD_W]} />
                  </mesh>
                  <mesh name="frame_bottom" material={M.steel} position={[FX - 0.012, BY, 0]}>
                    <boxGeometry args={[0.035, 0.045, BOARD_W]} />
                  </mesh>
                  {[1, -1].map((s) => (
                    <mesh
                      key={s}
                      name="frame_side"
                      material={M.steel}
                      position={[FX - 0.012, BCY, (s * BOARD_W) / 2]}
                    >
                      <boxGeometry args={[0.035, BOARD_H, 0.045]} />
                    </mesh>
                  ))}
                  {STRUTS.map((st, i) => (
                    <mesh
                      key={i}
                      name={'strut_' + i}
                      material={M.steel}
                      position={st.position}
                      rotation-x={st.rotX}
                    >
                      <boxGeometry args={[0.025, 0.03, st.len]} />
                    </mesh>
                  ))}
                  <group name="target_box" position={[FX + 0.0075, TB, 0]}>
                    <mesh material={M.paint} position={[0, 0.425, 0]}>
                      <boxGeometry args={[0.002, 0.05, 0.59]} />
                    </mesh>
                    <mesh material={M.paint} position={[0, 0.025, 0]}>
                      <boxGeometry args={[0.002, 0.05, 0.59]} />
                    </mesh>
                    {[1, -1].map((s) => (
                      <mesh key={s} material={M.paint} position={[0, 0.225, s * 0.27]}>
                        <boxGeometry args={[0.002, 0.45, 0.05]} />
                      </mesh>
                    ))}
                  </group>
                  <mesh name="pad_bottom" material={M.pad} position={[FX, BY - 0.02, 0]}>
                    <boxGeometry args={[0.07, 0.08, BOARD_W + 0.06]} />
                  </mesh>
                  {[1, -1].map((s) => (
                    <mesh
                      key={s}
                      name="pad_corner"
                      material={M.pad}
                      position={[FX, BY + 0.13, s * 0.89]}
                    >
                      <boxGeometry args={[0.07, 0.3, 0.08]} />
                    </mesh>
                  ))}

                  <group ref={rimPivot} name="RimPivot_3Axis" position={[FX + 0.006, TB, 0]}>
                    <mesh name="rim_plate" material={M.rim} position={[0.006, -0.03, 0]}>
                      <boxGeometry args={[0.012, 0.14, 0.16]} />
                    </mesh>
                    <mesh name="rim_bracket" material={M.rim} position={[0.08, 0, 0]}>
                      <boxGeometry args={[0.16, 0.022, 0.09]} />
                    </mesh>
                    <group ref={rimCenter} name="RimCenter" position={[RIM_CX, 0, 0]}>
                      <mesh
                        name="rim_ring"
                        material={M.rim}
                        geometry={G.ring}
                        rotation-x={Math.PI / 2}
                      />
                      <mesh name="net_hooks" material={M.rim} geometry={G.hooks} />
                    </group>
                  </group>
                </group>
              </group>
            </group>
          </group>
        </group>

        {/* baked contact shadows (shadow maps disabled) */}
        <mesh
          name="hoop_shadow"
          material={M.shadow}
          position={[1.4, 0.004, 0.35]}
          rotation={[-Math.PI / 2, 0, -0.12]}
          scale={[5.6, 1.5, 1]}
        >
          <planeGeometry />
        </mesh>
        <mesh
          name="base_shadow"
          material={M.shadow}
          position={[BASE_X + 0.1, 0.005, 0.05]}
          rotation-x={-Math.PI / 2}
          scale={[1.6, 1.3, 1]}
        >
          <planeGeometry />
        </mesh>
      </group>

      {/* ---------------- physics (world space) ---------------- */}
      <RigidBody
        type="fixed"
        colliders={false}
        position={BASE_WORLD}
        userData={{ kind: 'hoop', part: 'base' }}
      >
        <CuboidCollider args={[0.5, 0.09, 0.42]} position={[0, 0.09, 0]} />
        <CuboidCollider args={[0.26, 0.76, 0.24]} position={[0, 0.94, 0]} />
      </RigidBody>
      <KinematicProxy anchor={hinge1} part="lower_arm">
        <CuboidCollider args={[0.075, ARM1 / 2, 0.065]} position={[0, ARM1 / 2, 0]} />
      </KinematicProxy>
      <KinematicProxy anchor={hinge2} part="upper_arm">
        <CuboidCollider args={[ARM2 / 2, 0.065, 0.06]} position={[ARM2 / 2, 0, 0]} />
      </KinematicProxy>
      <KinematicProxy anchor={board} part="backboard">
        <CuboidCollider args={[0.02, BOARD_H / 2, BOARD_W / 2]} position={[FX - 0.014, BCY, 0]} />
        <CuboidCollider args={[0.035, 0.04, BOARD_W / 2 + 0.03]} position={[FX, BY - 0.02, 0]} />
      </KinematicProxy>
      <KinematicProxy anchor={rimCenter} part="rim">
        {Array.from({ length: RIM_BALLS }, (_, i) => {
          const a = (i / RIM_BALLS) * Math.PI * 2;
          return (
            <BallCollider
              key={i}
              args={[COURT.RIM_TUBE + 0.002]}
              position={[Math.cos(a) * COURT.RIM_RADIUS, 0, Math.sin(a) * COURT.RIM_RADIUS]}
            />
          );
        })}
      </KinematicProxy>

      <Net anchor={rimCenter} />
    </>
  );
}
