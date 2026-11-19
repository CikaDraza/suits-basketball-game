import assert from 'node:assert/strict';
import test from 'node:test';
import { defensiveStanceYaw } from '../src/game/entities/defensiveFacing';

test('defensive facing uses opponent world position in every quadrant and allows a missing target', () => {
  const player = { x: 6, z: 2 };
  for (const angle of [0, Math.PI / 2, -Math.PI / 2, Math.PI, Math.PI / 4, (-3 * Math.PI) / 4]) {
    const target = { x: player.x + 2 * Math.sin(angle), z: player.z + 2 * Math.cos(angle) };
    assert.ok(Math.abs(defensiveStanceYaw(player, target)! - angle) < 1e-9);
  }
  assert.equal(defensiveStanceYaw(player, null), null);
  assert.equal(defensiveStanceYaw(player, player), null);
});
