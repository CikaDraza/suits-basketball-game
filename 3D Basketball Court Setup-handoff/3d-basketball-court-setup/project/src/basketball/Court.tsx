import { useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import {
  RigidBody, CuboidCollider, useRapier,
  type CollisionEnterPayload, type IntersectionEnterPayload,
} from '@react-three/rapier';
import { COURT, COLORS, LINE_EDGE } from './constants';
import { buildCourtLineGeometry, createWoodTexture } from './courtGeometry';
import { isBeyondBoundary, type Boundary } from './rules';
import { useGameStore, type BodyTag } from './gameStore';

const { LENGTH: L, HALF_WIDTH: HW, FLOOR_SIZE, FLOOR_CENTER_X } = COURT;
const E = LINE_EDGE;
const FX0 = FLOOR_CENTER_X - FLOOR_SIZE / 2, FX1 = FLOOR_CENTER_X + FLOOR_SIZE / 2, FZ = FLOOR_SIZE / 2;
const FLOOR_T = 0.5;

interface Region { boundary: Boundary; x0: number; x1: number; z0: number; z1: number }

/** Floor outside the OUTER edge of each boundary line. */
const OUT_REGIONS: Region[] = [
  { boundary: 'baseline', x0: FX0, x1: -E, z0: -FZ, z1: FZ },
  { boundary: 'halfcourt', x0: L + E, x1: FX1, z0: -FZ, z1: FZ },
  { boundary: 'sideline-right', x0: -E, x1: L + E, z0: HW + E, z1: FZ },
  { boundary: 'sideline-left', x0: -E, x1: L + E, z0: -FZ, z1: -HW - E },
];
/** The painted boundary strips themselves (touching a line = out for players). */
const LINE_STRIPS: Region[] = [
  { boundary: 'baseline', x0: -E, x1: E, z0: -HW - E, z1: HW + E },
  { boundary: 'halfcourt', x0: L - E, x1: L + E, z0: -HW - E, z1: HW + E },
  { boundary: 'sideline-right', x0: -E, x1: L + E, z0: HW - E, z1: HW + E },
  { boundary: 'sideline-left', x0: -E, x1: L + E, z0: -HW - E, z1: -HW + E },
];

const cuboid = (r: Omit<Region, 'boundary'>, y0: number, y1: number) => ({
  args: [(r.x1 - r.x0) / 2, (y1 - y0) / 2, (r.z1 - r.z0) / 2] as [number, number, number],
  position: [(r.x0 + r.x1) / 2, (y0 + y1) / 2, (r.z0 + r.z1) / 2] as [number, number, number],
});

const tagOf = (o: { rigidBody?: { userData?: unknown } }) => o.rigidBody?.userData as BodyTag | undefined;

export interface CourtProps {
  /** Out-of-bounds detection + inbound timer. Disable for pure visual use. */
  referee?: boolean;
}

/** Half-court floor, markings, and the four out-of-bounds boundaries. */
export function Court({ referee = true }: CourtProps) {
  const maxAniso = useThree((s) => s.gl.capabilities.getMaxAnisotropy());
  const wood = useMemo(() => createWoodTexture(maxAniso), [maxAniso]);
  const lines = useMemo(() => buildCourtLineGeometry(), []);
  useEffect(() => () => { wood.dispose(); lines.dispose(); }, [wood, lines]);

  return (
    <group name="Court">
      <mesh name="floor" rotation-x={-Math.PI / 2} position={[FLOOR_CENTER_X, 0, 0]}>
        <planeGeometry args={[FLOOR_SIZE, FLOOR_SIZE]} />
        <meshStandardMaterial name="wood_maple" map={wood} roughness={0.62} metalness={0} />
      </mesh>
      <mesh name="court_lines" geometry={lines} position-y={0.002}>
        <meshStandardMaterial name="line_paint" color={COLORS.line} roughness={0.85} metalness={0}
          polygonOffset polygonOffsetFactor={-2} polygonOffsetUnits={-2} />
      </mesh>
      <CourtPhysics referee={referee} />
    </group>
  );
}

function CourtPhysics({ referee }: { referee: boolean }) {
  const { rapier } = useRapier();
  const callBallOut = useGameStore((s) => s.callBallOutOfBounds);
  const callPlayerOut = useGameStore((s) => s.callPlayerOutOfBounds);
  const tickInbound = useGameStore((s) => s.tickInbound);
  // Sensors must also see kinematic character controllers.
  const sensorTypes = rapier.ActiveCollisionTypes.DEFAULT | rapier.ActiveCollisionTypes.KINEMATIC_FIXED;

  useFrame(() => { if (referee) tickInbound(performance.now()); });

  /** Ball: out only when it has fully crossed the line AND touches the outside floor. */
  const onOutFloor = (boundary: Boundary) => (e: CollisionEnterPayload) => {
    if (!referee || tagOf(e.other)?.kind !== 'ball') return;
    const p = e.other.rigidBody!.translation();
    if (isBeyondBoundary(p.x, p.z)) callBallOut(p.x, p.z, boundary);
  };
  /** Player: out the instant a foot collider touches a line or the floor beyond it. */
  const onFoot = (boundary: Boundary) => (e: IntersectionEnterPayload) => {
    const tag = tagOf(e.other);
    if (!referee || tag?.kind !== 'foot') return;
    const p = e.other.rigidBody!.translation();
    callPlayerOut(tag.playerId, tag.team, p.x, p.z, boundary);
  };

  return (
    <RigidBody type="fixed" colliders={false} userData={{ kind: 'floor' }} friction={0.8} restitution={0.75}>
      <CuboidCollider {...cuboid({ x0: -E, x1: L + E, z0: -HW - E, z1: HW + E }, -FLOOR_T, 0)} />
      {OUT_REGIONS.map((r) => (
        <CuboidCollider key={'out-' + r.boundary} {...cuboid(r, -FLOOR_T, 0)} onCollisionEnter={onOutFloor(r.boundary)} />
      ))}
      {LINE_STRIPS.map((r) => (
        <CuboidCollider key={'line-' + r.boundary} sensor activeCollisionTypes={sensorTypes}
          {...cuboid(r, 0, 0.1)} onIntersectionEnter={onFoot(r.boundary)} />
      ))}
      {OUT_REGIONS.map((r) => (
        <CuboidCollider key={'zone-' + r.boundary} sensor activeCollisionTypes={sensorTypes}
          {...cuboid(r, 0, 0.3)} onIntersectionEnter={onFoot(r.boundary)} />
      ))}
    </RigidBody>
  );
}
