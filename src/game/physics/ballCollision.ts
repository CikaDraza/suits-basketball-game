import { interactionGroups, type RapierRigidBody } from '@react-three/rapier';
import type { BallState } from '../simulation/types';

// Environment uses Rapier's default memberships. Players have their own membership,
// so in-flight passes use swept hand reaches, rather than automatic torso pickups.
export const PLAYER_COLLISION_GROUPS = interactionGroups(1, [0, 1, 2]);
const BALL_COLLISION_GROUPS = interactionGroups(2, [0, 1]);
const PASS_COLLISION_GROUPS = interactionGroups(2, [0]);

export function syncBallCollision(body: RapierRigidBody | null, state: BallState): void {
  if (!body || body.numColliders() === 0) return;
  const collider = body.collider(0);
  const sensor = state !== 'pass' && state !== 'loose' && state !== 'scored';
  const groups = state === 'pass' ? PASS_COLLISION_GROUPS : BALL_COLLISION_GROUPS;
  if (collider.isSensor() !== sensor) collider.setSensor(sensor);
  if (collider.collisionGroups() !== groups) collider.setCollisionGroups(groups);
}
