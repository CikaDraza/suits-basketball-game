import { useCallback, useLayoutEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useTexture } from '@react-three/drei';
import {
  RigidBody,
  CapsuleCollider,
  BallCollider,
  type RapierRigidBody,
  useBeforePhysicsStep,
  useAfterPhysicsStep,
} from '@react-three/rapier';
import { Mesh, Group, SRGBColorSpace } from 'three';
import { config, level } from '../data/gameConfig';
import { TEXTURE_PATHS } from '../assets/manifest';
import { useGameStore } from '../state/gameStore';
import { useDuelTestSeam } from '../harness/useDuelTestSeam';
import { isSimulationRunning } from '../simulation/isSimulationRunning';
import type { PlayerSlot } from '../simulation/types';
import { Character } from './Character';
import { InboundCountdown } from './InboundCountdown';
import { duel, bodies, tickDuel } from './Duel';
import { afterDuelPhysicsStep } from './Duel';
import { PLAYER_COLLISION_GROUPS } from '../physics/ballCollision';

const SPAWNS = level.spawns.map(
  (position) => [position.x, position.y, position.z] as [number, number, number],
);
const BALL_SPAWN: [number, number, number] = [
  level.spawns[0].x,
  config.ball.holdHeight,
  level.spawns[0].z,
];
const LOCKED_ROTATIONS: [boolean, boolean, boolean] = [false, false, false];
const CAPSULE_ARGS: [number, number] = [config.physics.halfHeight, config.physics.radius];
const BALL_ARGS: [number] = [config.ball.radius];
const BALL_USER_DATA = { kind: 'ball' };
const PLAYER_COLORS = ['#f1a355', '#689ab9'] as const;

function DuelPlayer({ index }: { readonly index: PlayerSlot }) {
  const legend = useGameStore((state) => state.legends[index]);
  const bindBody = useCallback(
    (body: RapierRigidBody | null) => {
      bodies.players[index] = body;
    },
    [index],
  );

  return (
    <RigidBody
      type="dynamic"
      ref={bindBody}
      position={SPAWNS[index]}
      colliders={false}
      enabledRotations={LOCKED_ROTATIONS}
      linearDamping={config.physics.damping}
      canSleep={false}
    >
      <CapsuleCollider
        key={legend}
        args={CAPSULE_ARGS}
        mass={config.player[legend].mass}
        friction={0}
        collisionGroups={PLAYER_COLLISION_GROUPS}
      />
      <Character index={index} legend={legend} />
    </RigidBody>
  );
}

function bindBall(body: RapierRigidBody | null): void {
  bodies.ball = body;
}
function bindBallMesh(mesh: Mesh | null): void {
  bodies.ballMesh = mesh;
}

function DuelBall() {
  const texture = useTexture(TEXTURE_PATHS.basketball);

  useLayoutEffect(() => {
    if (texture.colorSpace !== SRGBColorSpace) {
      texture.colorSpace = SRGBColorSpace;
      texture.needsUpdate = true;
    }
  }, [texture]);

  return (
    <RigidBody
      ref={bindBall}
      colliders={false}
      userData={BALL_USER_DATA}
      position={BALL_SPAWN}
      ccd
      restitution={config.physics.ballRestitution}
      friction={0.4}
    >
      <BallCollider args={BALL_ARGS} sensor />
      <mesh ref={bindBallMesh}>
        <sphereGeometry args={[config.ball.radius, 20, 12]} />
        <meshStandardMaterial map={texture} color="#ffb171" roughness={0.78} />
      </mesh>
    </RigidBody>
  );
}

export function DuelArena() {
  const rings = useRef<Group>(null);
  const burst = useRef<Mesh>(null);
  useDuelTestSeam();
  useBeforePhysicsStep(() => tickDuel(1 / config.physics.timestep));
  useAfterPhysicsStep(afterDuelPhysicsStep);

  useFrame(() => {
    if (!isSimulationRunning()) return;

    if (rings.current) {
      for (let index = 0; index < duel.players.length; index++) {
        const player = duel.players[index];
        rings.current.children[index].position.set(player.x, 0.024, player.z);
      }
    }

    if (burst.current) {
      const progress = (duel.time - duel.event.t) / config.effects.impactDuration;
      burst.current.visible = progress >= 0 && progress < 1;
      if (burst.current.visible) {
        burst.current.position.set(duel.event.x, 0.07, duel.event.z);
        burst.current.scale.setScalar(0.6 + progress * 2);
      }
    }
  });

  return (
    <>
      <DuelPlayer index={0} />
      <DuelPlayer index={1} />
      <DuelBall />
      <group ref={rings}>
        {PLAYER_COLORS.map((color) => (
          <mesh key={color} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[0.68, 0.73, 32]} />
            <meshBasicMaterial color={color} transparent opacity={0.85} depthWrite={false} />
          </mesh>
        ))}
      </group>
      <InboundCountdown />
      <mesh ref={burst} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
        <ringGeometry args={[0.4, 0.44, 24]} />
        <meshBasicMaterial color="#ffd697" transparent opacity={0.8} depthWrite={false} />
      </mesh>
    </>
  );
}
