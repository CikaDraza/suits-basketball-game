import assert from 'node:assert/strict';
import test from 'node:test';
import { deriveStates, type PostureInput } from '../src/game/entities/posture';

const input: PostureInput = {
  mode: 'idle',
  controlled: false,
  handling: 'hold',
  receiving: false,
  ballState: 'held',
  inboundOwner: 1,
  inboundStage: 'pass',
  slot: 0,
  opponentHasBall: true,
  opponentDistance: 1.3,
  guardRange: 3.2,
  defenseReleased: false,
  sinceRequest: Infinity,
  sinceCut: Infinity,
  callForPass: { fallback: 'none', requestHold: 1, cutHold: 1 },
};
test('Q exit suppresses proximity guarding without bypassing possession, explicit post or inbound denial', () => {
  assert.deepEqual(deriveStates(input), { posture: 'defensive', upper: 'guard' });
  const released = { ...input, defenseReleased: true };
  assert.deepEqual(deriveStates(released), { posture: 'upright', upper: 'relaxed' });
  assert.equal(deriveStates({ ...released, mode: 'post' }).posture, 'post');
  assert.equal(deriveStates({ ...released, controlled: true }).upper, 'hold');
  assert.deepEqual(deriveStates({ ...released, ballState: 'inbound' }), {
    posture: 'defensive',
    upper: 'deny',
  });
});
