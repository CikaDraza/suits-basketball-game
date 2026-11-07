import { interactionGroups, type RapierRigidBody } from '@react-three/rapier';
import type { BallState } from '../simulation/types';
import { RigidBodyType } from '@dimforge/rapier3d-compat';

// Environment uses Rapier's default memberships. Players have their own membership,
// so in-flight passes use swept hand reaches, rather than automatic torso pickups.
export const PLAYER_COLLISION_GROUPS = interactionGroups(1, [0, 1, 2]);
/** A free (loose/scored) ball bounces off the environment and the players. */
const BALL_COLLISION_GROUPS = interactionGroups(2, [0, 1]);
/**
 * A ball driven by the game (held, shot, smash, inbound) or flying as a pass never interacts
 * with player capsules. The held ball sits inside its holder's capsule (hold point < capsule
 * radius); even as a kinematic sensor in the player group it was resolved against that
 * capsule every step and, because it follows the body, pushed the holder across the court
 * (a caught inbound pass slid the receiver at ~12 m/s; a pickup launched a player 100 m up).
 */
const SCRIPTED_BALL_GROUPS = interactionGroups(2, [0]);

/** Player capsules the ball must not start inside when it becomes solid. */
export interface BallClearance {
  players: readonly (RapierRigidBody | null)[];
  halfHeight: number;
  radius: number;
  ballRadius: number;
}

/**
 * A ball that becomes solid inside a player's capsule (a fumble/steal leaves it where the
 * hands held it, i.e. within the torso radius) is resolved by Rapier as a deep overlap and
 * launches the 140 kg capsule. Push the ball out to the capsule surface first.
 */
export function clearBallFromPlayers(body: RapierRigidBody, clearance: BallClearance): void {
  const p = body.translation();
  const point = { x: p.x, y: p.y, z: p.z };
  let moved = false;
  for (const player of clearance.players) {
    if (!player) continue;
    const c = player.translation();
    // overlap test against the vertical capsule (segment ± radius)
    const y = Math.max(c.y - clearance.halfHeight, Math.min(c.y + clearance.halfHeight, point.y));
    const minimum = clearance.radius + clearance.ballRadius + 0.01;
    if (Math.hypot(point.x - c.x, point.y - y, point.z - c.z) >= minimum) continue;
    // resolve sideways (the capsules are upright): pushing up/down would drive the ball into
    // the floor or lift it over the head
    let dx = point.x - c.x,
      dz = point.z - c.z;
    const horizontal = Math.hypot(dx, dz);
    if (horizontal < 1e-6) {
      dx = 1;
      dz = 0;
    } else {
      dx /= horizontal;
      dz /= horizontal;
    }
    point.x = c.x + dx * minimum;
    point.z = c.z + dz * minimum;
    moved = true;
  }
  if (moved) body.setTranslation(point, true);
}

export function syncBallCollision(
  body: RapierRigidBody | null,
  state: BallState,
  clearance?: BallClearance,
): void {
  if (!body || body.numColliders() === 0) return;
  const collider = body.collider(0);
  // becoming solid against players: never start inside a capsule
  if (clearance && collider.isSensor() && (state === 'loose' || state === 'scored'))
    clearBallFromPlayers(body, clearance);
  const type =
    state === 'pass' || state === 'loose' || state === 'scored'
      ? RigidBodyType.Dynamic
      : RigidBodyType.KinematicPositionBased;
  if (body.bodyType() !== type) body.setBodyType(type, true);
  const sensor = state !== 'pass' && state !== 'loose' && state !== 'scored';
  const groups = state === 'pass' || sensor ? SCRIPTED_BALL_GROUPS : BALL_COLLISION_GROUPS;
  if (collider.isSensor() !== sensor) collider.setSensor(sensor);
  if (collider.collisionGroups() !== groups) collider.setCollisionGroups(groups);
}
