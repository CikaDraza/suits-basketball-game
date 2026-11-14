import { motionAudit } from '../diagnostics/motionAudit';
import { motionRecorder } from '../diagnostics/recorder';
import type { World } from '@dimforge/rapier3d-compat';
import { COURT, HOOP } from '../court/constants';
import { syncBallCollision } from '../physics/ballCollision';
import {
  cancelDribbleSkill,
  protectedBallTarget,
  requestDribbleSkill,
  stepBallHandling,
} from '../simulation/ballHandling';
import type { Camera } from 'three';
import { resolveSkillFrame, type HandGesture } from '../input/skillGesture';
import { rightStickDebug } from '../input/rightStickDebug';
import { createDefensiveHandInput, hasRaisedDefensiveHands } from '../input/defensiveHands';
import { defensivePushImpulse } from '../simulation/defensivePush';
import { createInboundPassController } from '../simulation/inboundPassController';
import { isOnCourt, type PassPoint } from '../simulation/tacticalPass';
import { approachVelocity } from '../simulation/movement';
import type { RapierRigidBody } from '@react-three/rapier';
import { config as c, level, type Legend } from '../data/gameConfig';
import { playSound as sound } from '../audio/audio';
import { clamp, distanceXZ as dist, type PointXZ } from '../utils/math';
import { createMovementTransform } from '../simulation/coordinates';
import { createDuelState } from '../simulation/runtime';
import { createHudSnapshot } from '../simulation/hudSnapshot';
import { isSimulationRunning } from '../simulation/isSimulationRunning';
import type { Fighter, PlayerSlot } from '../simulation/types';
import { isFreeMovement, useGameStore } from '../state/gameStore';
import {
  getInputResetVersion,
  takeButtonEdges,
  getHeldMovementDuration,
  takeReleasedMovements,
  useInputStore,
} from '../state/inputStore';
import {
  cancelHeldMovement,
  stepHeldMovement,
  stepTimedHeldMovement,
  type ReleasedMovement,
} from '../simulation/heldMovement';
import { useHarnessStore } from '../state/harnessStore';
import { useControlSettingsStore } from '../state/controlSettingsStore';
import {
  readGamepadInput,
  nthConnectedPad,
  createPadGate,
  getPadNeutral,
} from '../input/gamepadInput';
import { setControlContextReader } from '../input/controlContext';
import { createDribbleSkillBuffer } from '../input/dribbleSkillBuffer';
import { hoopImpulse, hangOnRim, resetHoop } from '../court/hoopRig';

export type { Fighter, Mode, Handling, InboundStage } from '../simulation/types';

/*
 * One-on-one duel simulation (mutable runtime, ticked before each Rapier step by <DuelArena/>).
 *
 * Ball states: held | loose | shot | pass | smash | inbound | scored
 * Inbound phase (after a basket, out of bounds or a 5-second violation):
 *   POSITIONING (5 s) — ball sits on the left (near) sideline, nobody can pass, both players
 *                       move and shove for position; Q / △ toggles a sealing stance.
 *   PASS_WINDOW (5 s) — the player in possession presses E / ✕ / A to pass it in; if the clock
 *                       hits 0 first → 5-second violation, possession flips, new inbound.
 * Ball handling:
 *   On every catch/recovery the ball is HELD with both hands at the chest (no dribble).
 *   Release a short directional tap = jab step / body fake on the pivot foot.
 *   Keep a direction pressed beyond the short tap window = start dribbling and moving.
 */
export const duel = createDuelState(['shaq', 'chuck']);
const freeMovement = () => isFreeMovement(useGameStore.getState().session);
const inputContext = (slot: number) =>
  !freeMovement() &&
  (duel.ballState === 'inbound' || duel.ballState === 'pass' ? duel.inboundOwner : duel.owner) ===
    slot
    ? ('offense' as const)
    : ('defense' as const);
setControlContextReader(inputContext);
const padGate = createPadGate();
const cameraRise = c.camera.height - c.camera.target[1];
const skillVerticalScale = cameraRise / Math.hypot(c.camera.horizontalDistance, cameraRise);
export const skillInputs = [0, 1].map((slot) =>
  createDribbleSkillBuffer(
    c.camera.inputAngle,
    skillVerticalScale,
    c.ballControl.skills.doubleFlickWindow,
    import.meta.env?.DEV
      ? (event) => {
          if (inputContext(slot) === 'offense' || event.stage === 'cancelled')
            motionAudit.gesture(slot, 'offense', event);
        }
      : undefined,
  ),
);
const defensiveInputs = [0, 1].map((slot) =>
  createDefensiveHandInput(
    c.defense.hands.doubleFlickWindow,
    import.meta.env?.DEV ? (event) => motionAudit.gesture(slot, 'defense', event) : undefined,
  ),
);

/** Observe skill edges before Rapier; a release in a render frame cannot erase a pending command. */
export function sampleDuelSkillInput(frame?: { camera: Camera }) {
  if (duel.revision !== useGameStore.getState().revision)
    resetDuel(useHarnessStore.getState().seed);
  const settings = useControlSettingsStore.getState();
  const pads = navigator.getGamepads?.() ?? [];
  const version = getInputResetVersion();
  for (let slot = 0; slot < 2; slot++) {
    const pad = nthConnectedPad(pads, slot);
    const neutral = getPadNeutral(settings.profile, pad);
    const allowed = padGate(pad, slot, version, settings.profile.deadzone, neutral);
    const mapped = readGamepadInput(
      allowed ? pad : null,
      settings.profile[inputContext(slot)],
      settings.profile.deadzone,
      neutral,
    );
    const player = duel.players[slot];
    const enabled =
      allowed && (!freeMovement() || slot === 0) && isSimulationRunning() && !settings.capturing;
    const cameraAngle = frame
      ? Math.atan2(frame.camera.matrixWorld.elements[8], frame.camera.matrixWorld.elements[10])
      : c.camera.inputAngle;
    const verticalScale = frame
      ? Math.abs(frame.camera.matrixWorld.elements[9])
      : skillVerticalScale;
    const defenseEnabled =
      enabled &&
      inputContext(slot) === 'defense' &&
      player.mode !== 'down' &&
      player.mode !== 'stun' &&
      player.mode !== 'dunk';
    if (import.meta.env?.DEV && (!freeMovement() || slot === 0)) {
      const gate = !pad
        ? 'no-gamepad'
        : !isSimulationRunning()
          ? 'paused-or-frozen'
          : settings.capturing
            ? 'binding-capture'
            : !allowed
              ? 'neutral-required'
              : null;
      const observed = readGamepadInput(
        pad,
        settings.profile[inputContext(slot)],
        settings.profile.deadzone,
        neutral,
      );
      const opponent = freeMovement() ? null : duel.players[1 - slot];
      motionAudit.physicalPad(
        slot,
        pad,
        {
          ...observed,
          resolvedFrame: resolveSkillFrame(
            observed.skill,
            player.angle,
            cameraAngle,
            verticalScale,
          ),
          camera: { yaw: cameraAngle, verticalScale },
          context: inputContext(slot),
          facing: player.angle,
          opponentDirection: opponent
            ? {
                world: Math.atan2(opponent.x - player.x, opponent.z - player.z),
                relative: Math.atan2(
                  Math.sin(Math.atan2(opponent.x - player.x, opponent.z - player.z) - player.angle),
                  Math.cos(Math.atan2(opponent.x - player.x, opponent.z - player.z) - player.angle),
                ),
              }
            : null,
        },
        gate,
      );
    }
    player.defenseHands = defensiveInputs[slot].sample({
      device: pad ? JSON.stringify([pad.id, pad.index, pad.axes.length]) : null,
      version,
      enabled: defenseEnabled,
      time: duel.time,
      vector: mapped.skill,
      facing: player.angle,
      cameraAngle,
      verticalScale,
    });
    if (!defenseEnabled) player.defensePushAt = -10;
    const eligible =
      duel.owner === slot &&
      duel.ballState === 'held' &&
      player.charge === 0 &&
      player.mode !== 'down' &&
      player.mode !== 'stun' &&
      player.mode !== 'dunk';
    skillInputs[slot].sample({
      device: pad ? JSON.stringify([pad.id, pad.index, pad.axes.length]) : null,
      version,
      vector: mapped.skill,
      hand: mapped.hand,
      facing: player.angle,
      time: duel.time,
      cameraAngle,
      verticalScale,
      enabled,
      eligible,
      ineligibleReason:
        duel.owner !== slot
          ? 'not-ball-owner'
          : duel.ballState !== 'held'
            ? 'ball-not-held'
            : player.charge > 0
              ? 'shot-charging'
              : `mode-${player.mode}`,
      crossing:
        duel.ballControl.owner === slot &&
        duel.ballControl.mode === 'dribble' &&
        (duel.ballControl.crossing || duel.ballControl.skill !== null),
      crossingKind: duel.ballControl.owner === slot ? duel.ballControl.skill?.kind : null,
    });
    if (import.meta.env?.DEV || useHarnessStore.getState().testMode) {
      const resolved = resolveSkillFrame(mapped.skill, player.angle, cameraAngle, verticalScale);
      const screenForward = resolved?.screenForward ??
        resolveSkillFrame({ x: 1, z: 0 }, player.angle, cameraAngle, verticalScale)
          ?.screenForward ?? { x: 0, z: 0 };
      const context = inputContext(slot),
        binding = settings.profile[context].gamepad;
      const defense = defensiveInputs[slot].debug,
        offense = skillInputs[slot];
      rightStickDebug[slot] = {
        slot,
        legend: player.legend,
        context,
        time: duel.time,
        device: pad?.id ?? null,
        enabled,
        eligible: context === 'defense' ? defenseEnabled : eligible,
        rawAxes: { axis2: pad?.axes[2] ?? 0, axis3: pad?.axes[3] ?? 0 },
        bindings: {
          left: binding.SKILL_LEFT,
          right: binding.SKILL_RIGHT,
          up: binding.SKILL_UP,
          down: binding.SKILL_DOWN,
        },
        calibrated: mapped.skillRaw,
        processed: mapped.skill,
        normalized: resolved?.normalized ?? { x: 0, z: 0 },
        screenForward,
        bodyRelative: resolved?.body ?? { left: 0, forward: 0 },
        resolved: resolved?.kind ?? null,
        anatomicalHand: resolved?.hand ?? null,
        selected:
          context === 'defense'
            ? player.defenseHands
            : !offense.armed && eligible
              ? (offense.debug.accepted?.kind ?? 'none')
              : 'none',
        executing:
          duel.ballControl.owner === slot ? (duel.ballControl.skill?.kind ?? 'none') : 'none',
        phase: context === 'defense' ? defense.phase : offense.phase,
        accepted: context === 'defense' ? defense.last : offense.debug.accepted,
        lockedFacing:
          context === 'defense'
            ? defense.facing
            : offense.armed
              ? null
              : (offense.debug.accepted?.facing ?? null),
        bodyFacing: player.angle,
        cameraYaw: cameraAngle,
        cameraPitch: Math.asin(Math.min(1, verticalScale)),
        cameraPitchScale: verticalScale,
        movementYaw: c.camera.inputAngle,
      };
    }
  }
}
export const bodies: {
  players: (RapierRigidBody | null)[];
  ball: RapierRigidBody | null;
  ballMesh: import('three').Mesh | null;
} = {
  players: [null, null],
  ball: null,
  ballMesh: null,
};
// ---------------------------------------------------------------- helpers
const random = () => {
  duel.seed = (Math.imul(1664525, duel.seed) + 1013904223) >>> 0;
  return duel.seed / 4294967296;
};
// Roll once per combination, even if the movement stick stays fully deflected.
const skillRisk = new WeakMap<object, boolean>();
const rim = {
  x: level.hoop.x,
  z: level.hoop.z,
};
const HUD_SETTINGS = {
  exhaustedThreshold: c.player.exhaustedThreshold,
  jabTapWindow: c.handling.jabTapWindow,
};
const PASS_COURT = {
  ...level.bounds,
  basket: level.hoop,
  boardX: COURT.BOARD_X,
  boardHalfWidth: HOOP.BOARD_W / 2,
};
function say(text: string, who = -1) {
  duel.message = text;
  duel.messageUntil = duel.time + c.effects.textDuration;
  duel.speaker = who;
}
/** FIBA arc: beyond 6.75 m, or in the corner strip beyond 6.6 m laterally. */
const isThree = (p: PointXZ) =>
  dist(p, rim) >= c.shots.longRange || Math.abs(p.z - rim.z) >= c.shots.cornerThree;
/** Rim pull of a hanging player: body weight plus arm pull, scaled by mass and power. */
const hangForce = (l: Legend) =>
  c.player[l].mass * 9.81 * c.shots.hangPull * (0.85 + 0.15 * c.player[l].power);
function impact(p: Fighter, heavy = false) {
  duel.event = {
    x: p.x,
    z: p.z,
    t: duel.time,
    color: heavy ? '#f15a36' : '#ffd49a',
  };
  duel.shake = heavy ? c.effects.dunkShake : c.effects.shakeIntensity;
  sound(heavy ? 'flop' : 'bump');
}
/** Camera-relative stick → world direction (and back). */
const { stickToWorld, worldToStick } = createMovementTransform(c.camera.inputAngle);
const facing = (p: Fighter, x: number, z: number) => Math.atan2(x - p.x, z - p.z);
/** Player capsules a newly solid (loose/scored) ball is pushed out of. */
const BALL_CLEARANCE = {
  players: bodies.players,
  halfHeight: c.physics.halfHeight,
  radius: c.physics.radius,
  ballRadius: c.ball.radius,
};
const rampTarget = { x: 0, z: 0 },
  rampOut = { x: 0, z: 0 };
/**
 * Defensive orientation (null = face the direction of travel):
 * - denial during an inbound: chest on the assigned receiver, opened toward the ball by
 *   `denyBallBias`, so the denying arm is in the lane (the back is not forced to the ball);
 * - on-ball: square up to the ball handler inside `guardRange`.
 */
function defensiveFacing(i: number): number | null {
  if (freeMovement()) return null;
  const p = duel.players[i],
    o = duel.players[1 - i];
  if ((duel.ballState === 'inbound' || duel.ballState === 'pass') && i !== duel.inboundOwner) {
    const toX = o.x - p.x,
      toZ = o.z - p.z,
      toL = Math.hypot(toX, toZ) || 1;
    const bX = duel.ball.x - p.x,
      bZ = duel.ball.z - p.z,
      bL = Math.hypot(bX, bZ) || 1;
    const bias = c.defense.denyBallBias;
    return Math.atan2(toX / toL + (bX / bL) * bias, toZ / toL + (bZ / bL) * bias);
  }
  if (duel.ballState === 'held' && duel.owner === 1 - i && dist(p, o) < c.defense.guardRange)
    return facing(p, o.x, o.z);
  return null;
}
/** Translate the last rendered hand offset by the body's exact current physics position. */
function receiverCatchTarget(slot: PlayerSlot): PassPoint {
  const p = duel.players[slot];
  const body = bodies.players[slot]?.translation() ?? { x: p.x, y: c.physics.bodyY, z: p.z };
  return protectedBallTarget(p.legend, body, p.angle, p.mode === 'post', { x: 0, y: 0, z: 0 });
}
// ---------------------------------------------------------------- possession
/** Catch / recovery: the ball is locked to the chest with both hands — no dribble yet. */
function gain(i: number, reason = 'catch-or-recovery') {
  if (import.meta.env?.DEV)
    motionRecorder.event('possession.gained', { previousOwner: duel.owner }, { slot: i, reason });
  const p = duel.players[i];
  if (i === 0) takeReleasedMovements();
  duel.owner = i;
  duel.ballState = 'held';
  duel.ballControl.owner = -1;
  cancelDribbleSkill(duel.ballControl);
  duel.lastTouch = i;
  p.handling = 'hold';
  cancelHeldMovement(p);
  p.jab = 0;
  p.charge = 0;
  p.holdClock = 0;
  p.aiClock = 0;
  p.aiJab = random() < c.ai.jabChance;
  if (p.mode !== 'down' && p.mode !== 'stun' && p.mode !== 'dunk') p.mode = 'idle';
  duel.catches++;
  duel.pickups++;
  bodies.ball?.setGravityScale(0, true);
  bodies.ball?.setLinvel({ x: 0, y: 0, z: 0 }, true);
  syncBallCollision(bodies.ball, duel.ballState, BALL_CLEARANCE);
  sound('dribble');
}
function loose(i: number, reason = 'gameplay-release') {
  if (import.meta.env?.DEV)
    motionRecorder.event('possession.lost', { previousOwner: duel.owner }, { slot: i, reason });
  const p = duel.players[i];
  duel.lastTouch = i;
  duel.owner = -1;
  duel.ballState = 'loose';
  cancelDribbleSkill(duel.ballControl);
  syncBallCollision(bodies.ball, duel.ballState, BALL_CLEARANCE);
  duel.looseTimer = c.ball.pickupDelay;
  bodies.ball?.setGravityScale(1, true);
  bodies.ball?.setLinvel(
    {
      x: p.hand * c.ball.looseKick,
      y: c.ball.dropUpVelocity,
      z: c.ball.looseKick,
    },
    true,
  );
  p.charge = 0;
  p.mode = 'idle';
}
type InboundReason = 'start' | 'score' | 'oob' | 'violation';
/** Ball to the left-sideline spot; POSITIONING starts, then the PASS_WINDOW. */
function inbound(owner: number, reason: InboundReason) {
  duel.owner = -1;
  duel.inboundOwner = owner;
  duel.ballState = 'inbound';
  duel.inboundStage = 'position';
  duel.inboundClock = c.inbound.positionTime;
  // CPU inbounder decides when it will pass; now and then it dawdles into a violation
  duel.aiPassAt =
    random() < c.inbound.aiLateChance
      ? c.inbound.passWindow + 1
      : c.inbound.aiPassMin + random() * (c.inbound.aiPassMax - c.inbound.aiPassMin);
  duel.players.forEach((p) => {
    p.charge = 0;
    p.handling = 'hold';
    cancelHeldMovement(p);
    if (p.mode === 'contest' || p.mode === 'shoot' || p.mode === 'post') p.mode = 'idle';
  });
  bodies.ball?.setGravityScale(0, true);
  syncBallCollision(bodies.ball, duel.ballState, BALL_CLEARANCE);
  bodies.ball?.setTranslation(level.inbound, true);
  bodies.ball?.setLinvel(
    {
      x: 0,
      y: 0,
      z: 0,
    },
    true,
  );
  if (import.meta.env?.DEV)
    motionRecorder.event('inbound.started', { owner, reason, clock: duel.inboundClock });
  const who = owner === 0 ? 'Your' : 'CPU';
  if (reason === 'oob') say(`Out of bounds. ${who} ball — fight for position.`);
  else if (reason === 'violation') say(`5-SECOND VIOLATION. ${who} ball now.`);
  else if (reason === 'score') say(`${who} inbound. Five seconds to get open.`);
  else say(`${who} inbound. Get open.`);
  sound('whistle');
}
const inboundPassController = createInboundPassController({
  runtime: duel,
  bodies,
  config: c,
  source: level.inbound,
  court: PASS_COURT,
  getCatchTarget: receiverCatchTarget,
  onPossession: (slot, intercepted) => {
    if (intercepted) duel.interceptions++;
    gain(slot, intercepted ? 'interception' : 'inbound-catch');
    say(
      intercepted ? 'INTERCEPTED. Read the passing lane.' : 'Caught. Two hands, chest high.',
      slot,
    );
  },
  onMessage: say,
  onLaunch: () => sound('swish'),
  onDeflection: () => sound('rim'),
  onOutOfBounds: () => inbound(1 - duel.lastTouch, 'oob'),
});

/** Runs after each actual Rapier substep, before another step can overwrite the contact. */
export function afterDuelPhysicsStep(world: World): void {
  if (!isSimulationRunning()) return;
  if (freeMovement()) {
    if (import.meta.env?.DEV) motionAudit.physics(world, duel, bodies);
    return;
  }
  inboundPassController.afterPhysicsStep(world);
  const point = bodies.ball?.translation();
  if (point) {
    if (
      duel.ballState === 'held' &&
      duel.ballControl.mode === 'dribble' &&
      duel.ballControl.floorEvent
    ) {
      duel.ballControl.floorContacts++;
      duel.ballControl.lastFloorY = point.y;
    }
    duel.ball.x = point.x;
    duel.ball.y = point.y;
    duel.ball.z = point.z;
  }
  if (import.meta.env?.DEV) motionAudit.physics(world, duel, bodies);
}
/** Jab step: quick fake on the pivot foot. A nearby CPU defender may bite on it. */
function jab(i: number, wx: number, wz: number) {
  const p = duel.players[i],
    o = duel.players[1 - i];
  const l = Math.hypot(wx, wz) || 1;
  p.jab = c.handling.jabDuration;
  p.jabX = wx / l;
  p.jabZ = wz / l;
  duel.jabs++;
  sound('post');
  const cpuDefender = 1 - i === 1 && !duel.p2Human;
  const canBite = o.mode !== 'down' && o.mode !== 'stun' && o.mode !== 'dunk' && o.bite <= 0;
  if (
    cpuDefender &&
    canBite &&
    dist(p, o) < c.handling.jabFakeRange &&
    random() < c.handling.biteChance
  ) {
    o.bite = c.handling.jabBite;
    o.biteX = p.jabX;
    o.biteZ = p.jabZ;
    duel.bites++;
    say(
      p.legend === 'shaq'
        ? 'Jab step. Chuck bit like a buffet.'
        : 'Jab step. Shaq bought it retail.',
      i,
    );
  } else if (duel.time > duel.messageUntil - 1) {
    say(i === 0 ? 'Jab step. Testing the waters.' : 'CPU jab. Don’t bite.', i);
  }
}
function flop(i: number) {
  const p = duel.players[i];
  if (p.cooldown > 0 || p.mode === 'down') return;
  p.mode = 'down';
  p.timer = c.player.downDuration;
  p.energy = Math.max(0, p.energy - c.player.flopCost);
  p.charge = 0;
  duel.flops++;
  if (duel.owner === i) loose(i, 'flop');
  p.mode = 'down';
  impact(p, true);
  say(i === 0 ? 'Taking a business trip.' : 'Chuck: “I meant to do that.”', i);
}
function smash(i: number) {
  const p = duel.players[i],
    o = duel.players[1 - i];
  if (duel.owner !== i || dist(p, o) > c.ball.smashRange) return;
  duel.smashes++;
  p.energy = Math.max(0, p.energy - c.player.smashCost);
  p.charge = 0;
  p.mode = 'idle';
  o.mode = 'stun';
  o.timer = c.player.stunDuration;
  const d = dist(p, o) || 1;
  o.vx = ((o.x - p.x) / d) * c.ball.smashImpulse;
  o.vz = ((o.z - p.z) / d) * c.ball.smashImpulse;
  duel.ballState = 'smash';
  const release = bodies.ball?.translation() ?? duel.ball;
  duel.flight = {
    ...duel.flight,
    sx: release.x,
    sy: release.y,
    sz: release.z,
    tx: o.x,
    ty: c.ball.smashTargetHeight,
    tz: o.z,
    t: 0,
    duration: c.ball.smashReturn,
    shooter: i,
  };
  impact(o, true);
  say('Special delivery. No signature needed.', i);
}
function shoot(i: number) {
  const p = duel.players[i],
    o = duel.players[1 - i];
  if (duel.owner !== i || duel.ballState !== 'held') return;
  const distance = dist(p, rim),
    perfect = Math.abs(p.charge - c.shots.perfectTime) <= c.shots.perfectWindow;
  const dunk = distance < c.shots.dunkRange && p.energy > c.shots.dunkEnergy;
  const contest =
    (o.mode === 'contest' || hasRaisedDefensiveHands(o.defenseHands)) &&
    dist(p, o) < c.ai.contestRange;
  const stat = c.player[p.legend];
  let accuracy =
    (c.shots.baseAccuracy +
      (perfect ? c.shots.perfectBonus : 0) -
      distance * c.shots.distancePenalty -
      (contest ? c.shots.contestPenalty : 0) -
      (p.energy < c.player.exhaustedThreshold ? c.shots.exhaustionPenalty : 0)) *
    stat.accuracy;
  if (dunk)
    accuracy =
      c.shots.dunkAccuracy - (contest ? c.shots.contestPenalty * c.shots.dunkContestMultiplier : 0);
  const made = random() < clamp(accuracy, c.shots.minAccuracy, c.shots.maxAccuracy);
  duel.shots++;
  if (dunk) {
    duel.dunks++;
    p.mode = 'dunk';
    p.timer = c.shots.dunkJump + c.shots.dunkHang;
    impact(p, true);
  } else {
    p.mode = 'shoot';
    p.timer = c.shots.flightDuration;
  }
  p.energy = Math.max(0, p.energy - c.player.shotCost);
  const missA = Math.PI * (0.15 + random() * 0.7);
  const release = bodies.ball?.translation() ?? duel.ball;
  duel.flight = {
    sx: release.x,
    sy: release.y,
    sz: release.z,
    tx: rim.x + (made ? 0 : Math.sin(missA) * c.shots.missOffset),
    ty: level.hoop.y + (dunk ? c.shots.dunkClearance : made ? 0.05 : 0.08),
    tz: rim.z + (made ? 0 : Math.cos(missA) * c.shots.missOffset),
    t: 0,
    duration: dunk ? c.shots.dunkJump : c.shots.flightDuration,
    arc: dunk
      ? c.shots.dunkArc
      : distance < c.shots.hookRange
        ? c.shots.hookArc
        : c.shots.arcHeight,
    made,
    points: isThree(p) && !dunk ? c.score.outside : c.score.inside,
    shooter: i,
    dunk: dunk && made,
  };
  if (dunk && !made) p.timer = c.shots.dunkJump + 0.15;
  duel.lastTouch = i;
  duel.owner = -1;
  duel.ballState = 'shot';
  p.charge = 0;
  say(
    dunk
      ? 'HOSTILE TAKEOVER.'
      : perfect
        ? contest
          ? 'Perfect release. Heavy traffic.'
          : 'Green release. Cash that check.'
        : contest
          ? 'Contested! That suit is in your face.'
          : distance < c.shots.hookRange
            ? 'Baby hook. Grown-man problems.'
            : 'Put it on the expense account.',
    i,
  );
}
// ---------------------------------------------------------------- reset
export function resetDuel(seed = 42, scenario?: string) {
  const state = useGameStore.getState();
  if (import.meta.env?.DEV) motionRecorder.event('session.reset', { nextRevision: state.revision });
  Object.assign(
    duel,
    createDuelState(
      state.legends,
      seed,
      state.revision,
      freeMovement() ? 'movement' : scenario === 'live' ? 'live' : 'inbound',
    ),
  );
  duel.lastInboundRequestId = state.inboundRequestSequence;
  skillInputs.forEach((input) => input.reset());
  defensiveInputs.forEach((input) => input.reset());
  rightStickDebug.fill(null);
  if (freeMovement()) {
    duel.message = 'Free Movement · Movement, Defense, Footwork.';
  }
  syncBallCollision(bodies.ball, duel.ballState, BALL_CLEARANCE);
  resetHoop();
  bodies.players.forEach((body, slot) => {
    body?.setTranslation(level.spawns[slot], true);
    body?.setLinvel(
      {
        x: 0,
        y: 0,
        z: 0,
      },
      true,
    );
    body?.setAngvel(
      {
        x: 0,
        y: 0,
        z: 0,
      },
      true,
    );
  });
  bodies.ball?.setTranslation(duel.ball, true);
  bodies.ball?.setLinvel(
    {
      x: 0,
      y: 0,
      z: 0,
    },
    true,
  );
  bodies.ball?.setAngvel(
    {
      x: 0,
      y: 0,
      z: 0,
    },
    true,
  );
  bodies.ball?.setGravityScale(0, true);
  useInputStore.getState().flush();
  if (!freeMovement()) {
    if (scenario !== 'live') inbound(level.initialOwner, 'start');
    if (scenario === 'inbound-cpu') inbound(1, 'start');
  }
  useGameStore.setState((previous) => ({
    ...createHudSnapshot(duel, previous, HUD_SETTINGS),
    screen: state.screen,
    finalScore: 0,
  }));
  if (import.meta.env?.DEV)
    motionAudit.begin(duel, state.session, useControlSettingsStore.getState().profile, bodies);
}
// ---------------------------------------------------------------- input (human / gamepad / CPU)
type Input = {
  x: number;
  z: number;
  q: boolean;
  r: boolean;
  inbound?: boolean;
  inboundPressed?: boolean;
  skill?: HandGesture | null;
  defensePush?: { facing: number; time: number } | null;
  heldFor?: number;
  releases?: readonly ReleasedMovement[];
  hand?: number;
  qPressed?: boolean;
  rPressed?: boolean;
  rReleased?: boolean;
};
function controls(i: number, dt: number): Input {
  const input = useInputStore.getState();
  const releases = i === 0 ? takeReleasedMovements() : undefined;
  const edges = i === 0 ? takeButtonEdges() : [];
  const settings = useControlSettingsStore.getState();
  const pad = nthConnectedPad(navigator.getGamepads?.() || [], i);
  const neutral = getPadNeutral(settings.profile, pad);
  const allowed = padGate(pad, i, getInputResetVersion(), settings.profile.deadzone, neutral);
  const mapped = readGamepadInput(
    allowed ? pad : null,
    settings.profile[inputContext(i)],
    settings.profile.deadzone,
    neutral,
  );
  const padSkill = skillInputs[i].take();
  const defensePush = defensiveInputs[i].takePush(duel.time);
  if (i === 0) {
    let x = input.moveX + mapped.x,
      z = input.moveZ + mapped.z;
    const magnitude = Math.hypot(x, z);
    if (magnitude > 1) {
      x /= magnitude;
      z /= magnitude;
    }
    let edgeHand = 0;
    for (const edge of edges)
      if (edge.active && (edge.action === 'handLeft' || edge.action === 'handRight'))
        edgeHand = edge.action === 'handLeft' ? 1 : -1;
    // Explicit key/touch edges take priority if two devices issue a command in the same tick.
    const hand = edgeHand;
    return {
      x,
      z,
      q: input.actionB || mapped.q,
      r: input.actionA || mapped.r,
      inbound: input.inbound || mapped.inbound,
      inboundPressed: edges.some((e) => e.action === 'inbound' && e.active),
      hand,
      skill: edgeHand ? null : padSkill,
      defensePush,
      qPressed: edges.some((e) => e.action === 'actionB' && e.active),
      rPressed: edges.some((e) => e.action === 'actionA' && e.active),
      rReleased: edges.some((e) => e.action === 'actionA' && !e.active) && !mapped.r,
      heldFor: Math.hypot(mapped.x, mapped.z) > 0 ? undefined : getHeldMovementDuration(),
      releases,
    };
  }
  if (
    pad &&
    (Math.hypot(mapped.x, mapped.z) > 0 ||
      mapped.q ||
      mapped.r ||
      mapped.inbound ||
      mapped.hand ||
      padSkill ||
      defensePush ||
      Math.hypot(mapped.skill.x, mapped.skill.z) > 0)
  )
    duel.p2Human = true;
  if (!pad && duel.p2Human) {
    duel.p2Human = false;
  }
  if (duel.p2Human) return { ...mapped, hand: 0, skill: padSkill, defensePush };
  if (useHarnessStore.getState().testMode) return { x: 0, z: 0, q: false, r: false };
  return cpu(i, dt);
}
function cpu(i: number, dt: number): Input {
  const p = duel.players[i],
    o = duel.players[1 - i];
  p.aiClock += dt;
  p.flopClock += dt;
  let tx: number;
  let tz: number;
  let r = false;
  let q = false;
  let inbound = false;
  const toward = (x: number, z: number): Input => ({
    ...worldToStick(x - p.x, z - p.z, c.ai.pursuitDeadzone),
    q,
    r,
    inbound,
  });
  if (p.mode === 'down')
    return {
      x: Math.sin(duel.time * c.ai.mashMoveRate),
      z: 0,
      q: Math.sin(duel.time * c.ai.mashRate) > 0,
      r: Math.cos(duel.time * c.ai.mashRate) > 0,
    };
  if (p.bite > 0)
    return {
      x: 0,
      z: 0,
      q: false,
      r: false,
    }; // frozen by the fake (velocity handled in tick)
  // ---- inbound: inbounder gets open and passes in the window; defender denies
  if (duel.ballState === 'inbound') {
    const spot = level.inbound;
    if (i === duel.inboundOwner) {
      const side = Math.sign(p.x - o.x) || 1;
      tx = spot.x + side * c.inbound.getOpenSpread;
      tz = spot.z - c.inbound.getOpenDistance;
      q = duel.inboundStage === 'position' && p.mode !== 'post';
      inbound =
        useGameStore.getState().phase === 'INBOUND_PHASE' &&
        duel.inboundStage === 'pass' &&
        c.inbound.passWindow - duel.inboundClock >= duel.aiPassAt;
      return toward(tx, tz);
    }
    const rcv = duel.players[duel.inboundOwner];
    const dx = spot.x - rcv.x,
      dz = spot.z - rcv.z,
      dl = Math.hypot(dx, dz) || 1;
    return toward(
      rcv.x + (dx / dl) * c.inbound.denyDistance,
      rcv.z + (dz / dl) * c.inbound.denyDistance,
    );
  }
  if (duel.ballState === 'pass' && i !== duel.inboundOwner) {
    const sinceAttempt = duel.time - p.lastR;
    r =
      dist(p, duel.ball) < c.ai.stealRange &&
      (sinceAttempt < c.inbound.passing.interceptWindow ||
        sinceAttempt > c.inbound.passing.interceptWindow + c.ai.reaction);
    return toward(duel.ball.x, duel.ball.z);
  }
  if (duel.ballState === 'pass' && i === duel.inboundOwner && duel.inboundPass) {
    // Meet the release target. Chasing the ball's current floor projection would
    // pull the receiver back toward the sideline and away from a physical lob.
    const { target } = duel.inboundPass;
    return toward(target.x - p.gripOffset.x, target.z - p.gripOffset.z);
  }
  p.rest = p.energy < c.ai.restThreshold ? true : p.energy > c.ai.restUntil ? false : p.rest;
  if (p.rest)
    return {
      x: 0,
      z: 0,
      q: false,
      r: o.charge > 0,
    };
  if (duel.owner === i) {
    // ---- triple threat after the catch: read, maybe jab, then commit to the dribble
    if (p.handling === 'hold' && p.charge === 0 && p.mode !== 'post') {
      p.holdClock += dt;
      const t = p.holdClock,
        a = c.ai;
      if (t < a.holdRead)
        return {
          x: 0,
          z: 0,
          q: false,
          r: false,
        };
      if (p.aiJab && t < a.holdRead + a.jabTap) {
        const rx = rim.x - p.x,
          rz = rim.z - p.z,
          side = Math.sign(o.z - p.z) || 1;
        return {
          ...worldToStick(-rz * side, rx * side),
          q: false,
          r: false,
        };
      }
      if (p.aiJab && t < a.holdRead + a.jabTap + a.jabPause)
        return {
          x: 0,
          z: 0,
          q: false,
          r: false,
        };
    }
    const distance = dist(p, rim);
    tx = rim.x + c.ai.rimApproach;
    tz = rim.z + Math.sin(duel.time * c.ai.offenseJuke) * c.ai.jukeAmplitude;
    if (distance < c.ai.shootDistance) {
      p.aiClock += dt;
      r = p.aiClock > c.ai.shootDelay && p.aiClock < c.ai.shootDelay + c.ai.charge;
      if (p.aiClock > c.ai.shootDelay + c.ai.charge + c.ai.reaction) p.aiClock = 0;
    }
    q = dist(p, o) < c.ai.defenseDistance && p.mode === 'idle' && p.handling === 'dribble';
  } else if (duel.owner === 1 - i) {
    const d = dist(o, rim) || 1;
    tx = o.x + ((rim.x - o.x) / d) * c.ai.defenseDistance;
    tz = o.z + ((rim.z - o.z) / d) * c.ai.defenseDistance;
    r = o.charge > 0 && dist(p, o) < c.ai.contestRange;
    if (
      p.flopClock > c.ai.flopInterval &&
      dist(p, o) < c.player.tripDistance &&
      o.mode === 'spin' &&
      random() < c.ai.flopChance
    ) {
      flop(i);
      p.flopClock = 0;
    }
  } else if (duel.ballState === 'shot') {
    tx = duel.flight.tx + c.ai.reboundOffsetZ;
    tz = duel.flight.tz;
  } else {
    tx = duel.ball.x;
    tz = duel.ball.z;
  }
  return toward(tx, tz);
}
// ---------------------------------------------------------------- tick
export function tickDuel(delta: number) {
  if (!isSimulationRunning()) return;
  if (duel.revision !== useGameStore.getState().revision)
    resetDuel(useHarnessStore.getState().seed);
  if (import.meta.env?.DEV) motionAudit.beginTick();
  const dt = Math.min(delta, 3 / c.physics.timestep);
  duel.time += dt;
  duel.rim *= Math.exp(-c.effects.rimDecay * dt);
  duel.looseTimer = Math.max(0, duel.looseTimer - dt);
  duel.players.forEach((p, i) => {
    const b = bodies.players[i];
    if (b) {
      const v = b.translation();
      p.x = v.x;
      p.z = v.z;
    }
  });
  duel.players.forEach((p, i) => {
    const b = bodies.players[i];
    if (!b || (freeMovement() && i !== 0)) return;
    const input = controls(i, dt);
    if (import.meta.env?.DEV)
      motionAudit.resolvedInput(i, input, i === 1 && !duel.p2Human ? 'cpu' : 'human');
    const resetVersion = getInputResetVersion();
    if (p.inputResetVersion !== resetVersion) {
      cancelHeldMovement(p);
      p.charge = 0;
      p.prevQ = p.prevR = p.prevInbound = false;
      if (duel.ballControl.owner === i) {
        cancelDribbleSkill(duel.ballControl);
        p.hand = duel.ballControl.hand;
      }
      p.prevX = 0;
      p.taps = 0;
      p.lastQ = p.lastR = -99;
      p.interceptUntil = 0;
      p.defensePushAt = -10;
      if (p.mode === 'contest') p.mode = 'idle';
      p.inputResetVersion = resetVersion;
    }
    const qDown = (input.q && !p.prevQ) || input.qPressed,
      rDown = (input.r && !p.prevR) || input.rPressed,
      inboundDown = (input.inbound && !p.prevInbound) || input.inboundPressed,
      rUp = (!input.r && p.prevR) || input.rReleased;
    const o = duel.players[1 - i];
    p.timer = Math.max(0, p.timer - dt);
    p.grace = Math.max(0, p.grace - dt);
    p.cooldown = Math.max(0, p.cooldown - dt);
    p.jab = Math.max(0, p.jab - dt);
    p.jabCd = Math.max(0, p.jabCd - dt);
    p.bite = Math.max(0, p.bite - dt);
    p.steal += dt;
    p.clumsy += dt;
    if (p.mode === 'down') {
      if (
        qDown ||
        rDown ||
        (Math.abs(input.x) > c.player.minMove && Math.abs(p.prevX) < c.player.minMove)
      )
        p.timer = Math.max(0, p.timer - c.player.mashRecovery);
      if (p.timer <= 0) {
        p.mode = 'idle';
        p.grace = c.player.modeCooldown;
        say('Back on the payroll.', i);
      }
    } else if (p.mode === 'stun' && p.timer <= 0) p.mode = 'idle';
    else if ((p.mode === 'shoot' || p.mode === 'dunk') && p.timer <= 0) p.mode = 'idle';
    const disabled = p.mode === 'down' || p.mode === 'stun' || p.mode === 'dunk';
    const owner = duel.owner === i && duel.ballState === 'held';
    if (import.meta.env?.DEV && disabled) {
      for (const [pressed, action] of [
        [qDown, 'stance'],
        [rDown, 'primary'],
        [inboundDown, 'inbound'],
        [!!input.hand, 'hand_change'],
      ] as const) {
        if (!pressed) continue;
        const id = motionAudit.request(i, action);
        motionAudit.decision(i, id, action, 'rejected', `mode-${p.mode}`);
      }
    }
    if (!disabled) {
      if (
        !owner &&
        input.defensePush &&
        duel.time >= p.defensePushCooldown &&
        inputContext(i) === 'defense'
      ) {
        p.defensePushAt = duel.time;
        p.defensePushApplied = false;
        p.defensePushCooldown = duel.time + c.defense.hands.pushCooldown;
        if (import.meta.env?.DEV) {
          const command = motionAudit.handCommand(i);
          if (command)
            motionAudit.executed(i, command.commandId, command.action, {
              stage: 'push-preparation',
            });
        }
      }
      if (
        import.meta.env?.DEV &&
        input.defensePush &&
        duel.time < p.defensePushCooldown &&
        p.defensePushAt !== duel.time
      ) {
        const command = motionAudit.handCommand(i);
        if (command)
          motionAudit.decision(i, command.commandId, command.action, 'rejected', 'push-cooldown');
      }
      if (inboundDown) {
        useGameStore.getState().requestInboundPass(i as PlayerSlot);
      }
      if (qDown) {
        const auditId = import.meta.env?.DEV ? motionAudit.request(i, 'stance_or_special') : 0;
        const auditMode = p.mode;
        if (duel.time - p.lastQ < c.player.doubleTapWindow) flop(i);
        else if (
          owner &&
          p.mode === 'post' &&
          Math.abs(input.x) > c.player.minMove &&
          p.energy >= c.player.spinCost
        ) {
          p.mode = 'spin';
          p.spin = c.player.spinDuration;
          p.energy -= c.player.spinCost;
          p.handling = 'dribble';
          const d = dist(p, rim) || 1;
          p.vx = ((rim.x - p.x) / d) * c.player.spinSpeed + input.x * c.player.jukeImpulse;
          p.vz = ((rim.z - p.z) / d) * c.player.spinSpeed;
          say('Spin cycle. Dry-clean only.', i);
          impact(p);
        } else {
          p.mode = p.mode === 'post' ? 'idle' : 'post';
          sound('post');
          say(
            i === 0 ? 'Back down. Business is personal.' : 'Chuck: “You cannot move this office.”',
            i,
          );
        }
        p.lastQ = duel.time;
        if (import.meta.env?.DEV) {
          const changed = p.mode !== auditMode;
          motionAudit.decision(
            i,
            auditId,
            'stance_or_special',
            changed ? 'accepted' : 'rejected',
            changed ? undefined : 'cooldown-or-already-active',
          );
          if (changed) motionAudit.executed(i, auditId, 'stance_or_special', { mode: p.mode });
        }
      }
      if (rDown) {
        const auditAction =
          duel.time - p.lastR < c.player.smashTapWindow && p.taps + 1 >= 3
            ? 'smash'
            : owner
              ? 'shoot_charge'
              : duel.ballState === 'pass'
                ? 'intercept_window'
                : 'contest';
        const auditId = import.meta.env?.DEV ? motionAudit.request(i, auditAction) : 0;
        const previousSmashes = duel.smashes;
        p.interceptUntil = duel.time + c.inbound.passing.interceptWindow;
        p.taps = duel.time - p.lastR < c.player.smashTapWindow ? p.taps + 1 : 1;
        p.lastR = duel.time;
        if (p.taps >= 3) {
          smash(i);
          p.taps = 0;
        } else if (duel.owner === i) p.charge = 0;
        if (import.meta.env?.DEV) {
          const accepted = auditAction !== 'smash' || duel.smashes > previousSmashes;
          motionAudit.decision(
            i,
            auditId,
            auditAction,
            accepted ? 'accepted' : 'rejected',
            accepted ? undefined : duel.owner !== i ? 'not-ball-owner' : 'out-of-range',
          );
          // Charge/contest are measured after this tick actually changes them.
          if (accepted && (auditAction === 'smash' || auditAction === 'intercept_window'))
            motionAudit.executed(i, auditId, auditAction, { evidence: auditAction });
        }
      }
      if (input.r && owner && p.taps < 3) p.charge = Math.min(c.shots.raiseDuration, p.charge + dt);
      else if (input.r && duel.owner !== i) {
        if (p.mode !== 'contest') sound('contest');
        p.mode = 'contest';
      }
      if (rUp) {
        if (import.meta.env?.DEV) {
          motionAudit.end(i, 'shoot_charge');
          motionAudit.end(i, 'contest');
          motionAudit.end(i, 'intercept_window');
        }
        if (import.meta.env?.DEV && owner) {
          const id = motionAudit.request(i, 'shoot_release');
          motionAudit.decision(
            i,
            id,
            'shoot_release',
            p.charge >= c.shots.minHold ? 'accepted' : 'rejected',
            p.charge >= c.shots.minHold ? undefined : 'below-minimum-hold',
          );
        }
        const previousShots = duel.shots;
        if (p.charge >= c.shots.minHold) shoot(i);
        else p.charge = 0;
        if (import.meta.env?.DEV && duel.shots > previousShots)
          motionAudit.confirm(i, 'shoot_release', { evidence: 'shot-launched', mode: p.mode });
        if (p.mode === 'contest') p.mode = 'idle';
      }
      const crossing =
        duel.ballControl.owner === i &&
        duel.ballControl.mode === 'dribble' &&
        (duel.ballControl.crossing || duel.ballControl.skill !== null);
      if (import.meta.env?.DEV && input.hand) {
        const id = motionAudit.request(i, 'hand_change', { hand: input.hand });
        const reason = !owner
          ? 'not-ball-owner'
          : p.charge > 0
            ? 'shot-charging'
            : crossing
              ? 'crossing-active'
              : null;
        motionAudit.decision(
          i,
          id,
          'hand_change',
          reason ? 'rejected' : 'accepted',
          reason ?? undefined,
        );
      }
      if (owner && input.hand && p.charge === 0 && !crossing) {
        p.hand = input.hand;
        if (p.handling === 'hold' && p.charge === 0) {
          p.handling = 'dribble';
          p.jab = 0;
          duel.dribbles++;
        }
        if (import.meta.env?.DEV)
          motionAudit.confirm(i, 'hand_change', { evidence: 'selected-hand', hand: p.hand });
      }
      if (owner && input.skill && p.charge === 0) {
        const initialHand =
          duel.ballControl.owner === i && duel.ballControl.mode === 'dribble'
            ? duel.ballControl.hand
            : p.hand;
        const accepted = requestDribbleSkill(duel.ballControl, input.skill, initialHand);
        if (import.meta.env?.DEV) {
          const id = motionAudit.gestureId(input.skill),
            action = `crossover_${input.skill.kind}`;
          motionAudit.decision(
            i,
            id,
            action,
            accepted ? 'accepted' : 'rejected',
            accepted ? undefined : 'active-skill-or-crossing',
          );
          if (accepted)
            motionAudit.executed(i, id, action, { stage: 'ball-control-skill-created' });
        }
        if (accepted) {
          if (p.handling === 'hold') {
            p.handling = 'dribble';
            p.jab = 0;
            duel.dribbles++;
          }
          sound('dribble');
        }
      }
    }
    // ---- release a short tap to jab; a continuing press commits straight to the dribble
    const stick = Math.min(1, Math.hypot(input.x, input.z));
    const activeSkill = owner ? duel.ballControl.skill : null;
    if (activeSkill && stick >= c.ballControl.skills.fullMoveThreshold) {
      if (!skillRisk.has(activeSkill))
        skillRisk.set(activeSkill, random() < c.ballControl.skills.movingLossChance);
    }
    if (activeSkill?.started && skillRisk.get(activeSkill) && duel.ballControl.phase >= 0.5) {
      const side = duel.ballControl.local.x < 0 ? -1 : 1;
      const behind = activeSkill.kind === 'behind' ? -1 : 1;
      loose(i, 'moving-skill-risk');
      bodies.ball?.setLinvel(
        {
          x: (Math.cos(p.angle) * side + Math.sin(p.angle) * behind) * c.ball.looseKick,
          y: c.ball.reboundUpVelocity,
          z: (-Math.sin(p.angle) * side + Math.cos(p.angle) * behind) * c.ball.looseKick,
        },
        true,
      );
      duel.fumbles++;
      say('Prebrz dribling — lopta je pobegla iz ruke!', i);
    }
    const holding = duel.owner === i && duel.ballState === 'held' && p.handling === 'hold';
    if (holding && !disabled && p.charge === 0) {
      const action =
        input.heldFor === undefined
          ? stepHeldMovement(p, input.x, input.z, dt, c.player.minMove, c.handling.jabTapWindow)
          : stepTimedHeldMovement(
              p,
              input.x,
              input.z,
              input.heldFor,
              input.releases ?? [],
              c.player.minMove,
              c.handling.jabTapWindow,
            );
      if (action === 'jab') {
        const id = import.meta.env?.DEV ? motionAudit.request(i, 'jab') : 0;
        const accepted = p.jabCd <= 0;
        if (accepted) {
          const w = stickToWorld(p.pendingMoveX, p.pendingMoveZ);
          jab(i, w.x, w.z);
          p.jabCd = c.handling.jabCooldown;
        }
        if (import.meta.env?.DEV) {
          motionAudit.decision(
            i,
            id,
            'jab',
            accepted ? 'accepted' : 'rejected',
            accepted ? undefined : 'jab-cooldown',
          );
          if (accepted) motionAudit.executed(i, id, 'jab', { evidence: 'jab-started' });
        }
      } else if (action === 'dribble') {
        p.handling = 'dribble';
        p.jab = 0;
        duel.dribbles++;
        sound('dribble');
        if (import.meta.env?.DEV) {
          const id = motionAudit.request(i, 'dribble');
          motionAudit.decision(i, id, 'dribble', 'accepted');
          motionAudit.executed(i, id, 'dribble', { evidence: 'held-movement-classified' });
        }
      }
    } else cancelHeldMovement(p);
    const anchored = duel.owner === i && duel.ballState === 'held' && p.handling === 'hold';
    const moving = disabled || anchored ? 0 : stick;
    p.moving = moving;
    const stat = c.player[p.legend];
    const speed =
      stat.speed *
      (p.energy < c.player.exhaustedThreshold ? c.player.exhaustedSpeed : 1) *
      (p.mode === 'post' ? c.player.postSpeed : 1) *
      (p.charge > 0 ? c.player.chargingSpeed : 1);
    let x = 0,
      z = 0;
    if (!disabled) {
      if (!anchored) {
        const w = stickToWorld(input.x, input.z);
        x = w.x * speed;
        z = w.z * speed;
      }
      let targetAngle = p.angle;
      if (moving > 0 && p.mode !== 'post') targetAngle = Math.atan2(x, z);
      const inboundPlay = duel.ballState === 'inbound' || duel.ballState === 'pass';
      const guardAngle = defensiveFacing(i);
      if (p.mode === 'post' && !freeMovement())
        targetAngle =
          !owner && inboundPlay
            ? facing(p, duel.ball.x, duel.ball.z) // the actual ball/passer, not a fixed spot
            : facing(p, rim.x, rim.z) + Math.PI;
      else if (anchored || p.charge > 0)
        targetAngle = facing(p, rim.x, rim.z); // triple threat faces the rim
      else if (p.mode === 'contest' && !freeMovement()) targetAngle = facing(p, o.x, o.z);
      else if (guardAngle !== null) {
        targetAngle = guardAngle; // slide/backpedal, chest on the man
        // heavy defenders slide and backpedal slower than they run forward
        const len = Math.hypot(x, z);
        if (len > 1e-6) {
          const along = (x * Math.sin(p.angle) + z * Math.cos(p.angle)) / len;
          const slide = 1 - (1 - c.defense.slideSpeed) * (1 - Math.max(0, along));
          x *= slide;
          z *= slide;
        }
      }
      const turn = Math.atan2(Math.sin(targetAngle - p.angle), Math.cos(targetAngle - p.angle));
      p.angle += turn * (1 - Math.exp(-c.ballControl.turnRate * dt));
    }
    if (p.bite > 0 && !disabled) {
      x = p.biteX * c.handling.jabBiteSpeed;
      z = p.biteZ * c.handling.jabBiteSpeed;
    }
    if (p.mode === 'dunk') {
      const d = dist(p, rim) || 1,
        tx = rim.x + Math.max(0.25, (p.x - rim.x) / d) * c.shots.dunkStand,
        tz = rim.z + ((p.z - rim.z) / d) * c.shots.dunkStand;
      x = (tx - p.x) * c.shots.dunkGlide;
      z = (tz - p.z) * c.shots.dunkGlide;
      p.vx = p.vz = 0;
      p.angle = facing(p, rim.x, rim.z);
    }
    if (p.mode === 'spin') {
      p.spin -= dt;
      if (p.spin <= 0) {
        p.mode = 'idle';
        p.vx *= c.player.spinEndRetention;
        p.vz *= c.player.spinEndRetention;
        if (duel.owner === i && dist(p, rim) < c.shots.dunkRange) {
          p.charge = c.shots.perfectTime;
          shoot(i);
        }
      } else p.angle += dt * c.player.spinTurnRate;
    }
    // Heavy bodies: ramp the controlled velocity toward the intent (~0.4 s to top speed).
    // Scripted motion (dunk glide, biting on a fake) and stops while disabled stay direct.
    if (p.mode === 'dunk' || (p.bite > 0 && !disabled)) {
      p.moveVX = x;
      p.moveVZ = z;
    } else {
      rampTarget.x = x;
      rampTarget.z = z;
      approachVelocity(
        { x: p.moveVX, z: p.moveVZ },
        rampTarget,
        stat.speed,
        c.movement.accelTime,
        c.movement.brakeTime,
        dt,
        rampOut,
      );
      p.moveVX = rampOut.x;
      p.moveVZ = rampOut.z;
    }
    p.vx *= Math.exp(-c.physics.damping * dt);
    p.vz *= Math.exp(-c.physics.damping * dt);
    // vertical velocity and collision response stay with Rapier
    b.setLinvel(
      {
        x: p.moveVX + p.vx,
        y: b.linvel().y,
        z: p.moveVZ + p.vz,
      },
      true,
    );
    const bounds = level.bounds;
    const bx = clamp(p.x, bounds.minX, bounds.maxX),
      bz = clamp(p.z, bounds.minZ, bounds.maxZ);
    if (bx !== p.x || bz !== p.z) {
      // keep the resting height: snapping to the spawn height would pop the body up 3 cm
      b.setTranslation({ x: bx, y: b.translation().y, z: bz }, true);
      if (bx !== p.x) p.moveVX = 0;
      if (bz !== p.z) p.moveVZ = 0;
    }
    p.energy = clamp(
      p.energy +
        dt *
          (moving > c.player.drainThreshold && !disabled
            ? -(c.player.moveDrain + (p.mode === 'post' ? c.player.postDrain : 0))
            : moving > 0
              ? c.player.slowRecovery
              : c.player.recovery),
      0,
      c.player.energyMax,
    );
    if (
      p.energy < c.player.exhaustedThreshold &&
      p.clumsy > c.player.fumbleInterval &&
      moving > c.player.drainThreshold &&
      !disabled
    ) {
      p.clumsy = 0;
      if (random() < c.player.fumbleChance) {
        duel.fumbles++;
        if (duel.owner === i) loose(i, 'exhaustion-fumble');
        p.mode = 'stun';
        p.timer = c.player.stunDuration;
        impact(p);
        say('Out of gas. In a three-piece suit.', i);
      }
    }
    // steals: a two-hand hold at the chest is much harder to rip than a live dribble
    if (
      duel.owner === 1 - i &&
      input.r &&
      p.steal > c.ai.stealInterval &&
      dist(p, o) < c.ai.stealRange &&
      o.charge === 0 &&
      o.mode !== 'post'
    ) {
      p.steal = 0;
      if (random() < c.ai.stealChance * (o.handling === 'hold' ? c.handling.holdStealFactor : 1)) {
        loose(1 - i, 'steal');
        say('Hostile acquisition. Loose ball!');
      }
    }
    // Ordinary loose-ball recovery. In-flight catches/steals use 3D sweeps after physics.
    if (
      duel.owner < 0 &&
      duel.ballState === 'loose' &&
      isOnCourt(duel.ball, PASS_COURT) &&
      duel.looseTimer <= 0 &&
      !disabled &&
      (moving > c.player.minMove || stick > c.player.minMove || input.q || input.r || i === 1) &&
      dist(p, duel.ball) < c.ball.reach &&
      duel.ball.y < c.ball.pickupHeight
    ) {
      say('Recovered. Back to work.', i);
      gain(i);
    }
    p.prevQ = input.q;
    p.prevR = input.r;
    p.prevInbound = Boolean(input.inbound);
    p.prevX = input.x;
    if (import.meta.env?.DEV) {
      if (p.charge > 0)
        motionAudit.confirm(i, 'shoot_charge', { evidence: 'charge-increased', charge: p.charge });
      if (p.mode === 'contest')
        motionAudit.confirm(i, 'contest', { evidence: 'contest-mode', mode: p.mode });
    }
  });
  const request = useGameStore.getState().inboundPassRequest;
  if (!freeMovement() && request && request.id !== duel.lastInboundRequestId) {
    duel.lastInboundRequestId = request.id;
    if (
      request.positioning &&
      duel.ballState === 'inbound' &&
      duel.inboundOwner === request.receiver &&
      duel.inboundStage === 'position'
    ) {
      const receiver = duel.players[request.receiver];
      if (receiver.mode !== 'down' && receiver.mode !== 'stun' && receiver.mode !== 'dunk') {
        receiver.mode = receiver.mode === 'post' ? 'idle' : 'post';
        if (import.meta.env?.DEV)
          motionAudit.resolveInbound(request.id, true, undefined, {
            evidence: 'inbound-positioning',
            mode: receiver.mode,
          });
        sound('post');
        say(
          receiver.mode === 'post'
            ? 'Seal the defender. Show a hand for the ball.'
            : 'Get open. Keep moving.',
          request.receiver,
        );
      } else if (import.meta.env?.DEV)
        motionAudit.resolveInbound(request.id, false, `mode-${receiver.mode}`);
    } else {
      duel.players[request.receiver].passRequestAt = duel.time;
      const launched = inboundPassController.launch(request.receiver);
      if (import.meta.env?.DEV)
        motionAudit.resolveInbound(
          request.id,
          launched,
          launched
            ? undefined
            : duel.inboundStage === 'position'
              ? 'positioning-not-complete'
              : 'launch-not-available',
          { evidence: 'inbound-launch', launched },
        );
      if (import.meta.env?.DEV)
        motionRecorder.event(
          'inbound.launch',
          { requestId: request.id, receiver: request.receiver, launched },
          {
            reason: launched
              ? undefined
              : duel.inboundStage === 'position'
                ? 'positioning-not-complete'
                : 'launch-not-available',
          },
        );
    }
  }
  // A double rear flick commits one forearm shove after its preparation, hit or miss.
  duel.players.forEach((p, i) => {
    if (
      p.defensePushApplied ||
      duel.time - p.defensePushAt < c.defense.hands.pushContactTime ||
      duel.time - p.defensePushAt > c.defense.hands.pushDuration
    )
      return;
    p.defensePushApplied = true;
    if (import.meta.env?.DEV && freeMovement())
      motionRecorder.event(
        'contact.push',
        { target: null, impulse: null },
        { slot: i, reason: 'no-opponent' },
      );
    if (
      freeMovement() ||
      !bodies.players[1 - i] ||
      p.mode === 'down' ||
      p.mode === 'stun' ||
      inputContext(i) !== 'defense'
    )
      return;
    const o = duel.players[1 - i];
    const impulse = defensivePushImpulse(
      { x: p.x, z: p.z, angle: p.angle, mass: c.player[p.legend].mass },
      { x: o.x, z: o.z, mass: c.player[o.legend].mass },
    );
    if (import.meta.env?.DEV)
      motionRecorder.event(
        'contact.push',
        {
          computedImpulse: impulse,
          impulse: o.mode !== 'dunk' && o.mode !== 'down' ? impulse : null,
          target: 1 - i,
          applied: !!impulse && o.mode !== 'dunk' && o.mode !== 'down',
        },
        {
          slot: i,
          reason: !impulse
            ? 'out-of-contact-range'
            : o.mode === 'dunk' || o.mode === 'down'
              ? 'target-disabled'
              : 'contact-impulse',
        },
      );
    if (!impulse || o.mode === 'dunk' || o.mode === 'down') return;
    o.vx += impulse.x;
    o.vz += impulse.z;
    duel.defensePushes++;
    impact(p);
    say('Obe podlaktice — napravi prostor!', i);
  });
  // ---- body contact
  const [a, b] = duel.players,
    d = dist(a, b) || 0.001;
  if (!freeMovement() && d < c.physics.radius * 2 + c.physics.contactPadding) {
    duel.players.forEach((p, i) => {
      const o = duel.players[1 - i];
      if (o.mode === 'down' && p.moving > c.player.minMove && p.mode !== 'down' && p.grace <= 0) {
        p.mode = 'down';
        p.timer = c.player.downDuration;
        if (duel.owner === i) loose(i, 'trip-contact');
        p.mode = 'down';
        impact(p, true);
        say('Trip hazard. No workers’ comp.', i);
      } else if (
        p.mode !== 'down' &&
        p.mode !== 'stun' &&
        p.moving > c.player.minMove &&
        p.cooldown <= 0
      ) {
        const power =
          c.player[p.legend].power *
          (p.mode === 'post' ? c.player.postImpulse : c.player.normalImpulse) *
          (p.energy < c.player.exhaustedThreshold ? c.player.exhaustedPush : 1);
        const ratio = c.player[p.legend].mass / c.player[o.legend].mass;
        o.vx += ((o.x - p.x) / d) * power * ratio;
        o.vz += ((o.z - p.z) / d) * power * ratio;
        p.cooldown = c.player.bumpCooldown;
        duel.bumps++;
        impact(p);
      }
    });
  }
  // ---- ball
  const ball = bodies.ball;
  if (ball && !freeMovement()) {
    syncBallCollision(ball, duel.ballState, BALL_CLEARANCE);
    if (duel.ballState !== 'held') {
      duel.ballControl.owner = -1;
      cancelDribbleSkill(duel.ballControl);
    }
    if (duel.ballState === 'held' && duel.owner >= 0) {
      duel.lastTouch = duel.owner;
      const p = duel.players[duel.owner];
      const body = bodies.players[duel.owner]?.translation() ?? {
        x: p.x,
        y: c.physics.bodyY,
        z: p.z,
      };
      const wasSkill = duel.ballControl.skill !== null;
      const target = stepBallHandling(
        duel.ballControl,
        duel.owner,
        p.legend,
        body,
        p.angle,
        p.handling,
        p.hand,
        p.mode === 'post',
        p.charge,
        ball.translation(),
        dt,
        duel.players[1 - duel.owner],
      );
      if (wasSkill || duel.ballControl.skill) p.hand = duel.ballControl.hand;
      ball.setGravityScale(0, true);
      ball.setNextKinematicTranslation(target);
    } else if (duel.ballState === 'shot' || duel.ballState === 'smash') {
      ball.setGravityScale(0, true);
      ball.setLinvel(
        {
          x: 0,
          y: 0,
          z: 0,
        },
        true,
      );
      const f = duel.flight;
      f.t += dt;
      let t = Math.min(1, f.t / f.duration);
      if (duel.ballState === 'smash') t = Math.sin(t * Math.PI);
      const arc = duel.ballState === 'shot' ? f.arc : c.ball.smashArc;
      ball.setNextKinematicTranslation({
        x: f.sx + (f.tx - f.sx) * t,
        y: f.sy + (f.ty - f.sy) * t + Math.sin(t * Math.PI) * arc,
        z: f.sz + (f.tz - f.sz) * t,
      });
      if (f.t >= f.duration) {
        if (duel.ballState === 'smash') duel.ballState = 'held';
        else if (f.made) {
          duel.score[f.shooter] += f.points;
          useGameStore.setState({
            score: duel.score[0],
            cpuScore: duel.score[1],
          });
          duel.rim = 1;
          sound('swish');
          duel.ballState = 'scored';
          syncBallCollision(ball, duel.ballState, BALL_CLEARANCE);
          duel.resetTimer = c.shots.resetDelay + (f.dunk ? c.shots.dunkHang : 0);
          duel.nextOwner = f.shooter;
          ball.setGravityScale(1, true);
          ball.setLinvel(
            {
              x: 0,
              y: f.dunk ? c.shots.dunkSlamVelocity : c.ball.scoreFallVelocity,
              z: 0,
            },
            true,
          );
          if (f.dunk) {
            const sp = duel.players[f.shooter],
              lateral = (sp.z - rim.z) / c.shots.dunkRange,
              force = hangForce(sp.legend);
            hangOnRim(c.shots.dunkHang, force, lateral, force * c.shots.dunkSlam);
            duel.shake = c.effects.dunkShake;
            impact(sp, true);
            sound('rim');
          }
          say(
            f.dunk
              ? duel.players[f.shooter].legend === 'shaq'
                ? 'SHAQTIN’ THE RIM. Steel is screaming.'
                : 'CHUCK HANGS ON. The rim filed a complaint.'
              : f.shooter === 0
                ? 'BUCKET. Retirement looks good.'
                : 'Chuck: “That’s barbecue chicken.”',
            f.shooter,
          );
          if (duel.score[f.shooter] >= c.score.winTarget) {
            useInputStore.getState().flush();
            useGameStore.setState({
              screen: f.shooter === 0 ? 'win' : 'gameover',
              finalScore: duel.score[0],
            });
          }
        } else {
          duel.ballState = 'loose';
          syncBallCollision(ball, duel.ballState, BALL_CLEARANCE);
          duel.looseTimer = c.shots.looseDelay;
          ball.setGravityScale(1, true);
          const ox = f.tx - rim.x,
            oz = f.tz - rim.z,
            ol = Math.hypot(ox, oz) || 1;
          ball.setLinvel(
            {
              x: Math.max(0.3, ox / ol) * c.ball.looseKick,
              y: c.ball.reboundUpVelocity,
              z: (oz / ol) * c.ball.looseKick + (random() - 0.5),
            },
            true,
          );
          hoopImpulse(
            [f.tx, level.hoop.y, f.tz],
            [(-ox / ol) * c.shots.rimClank, -c.shots.rimClank, (-oz / ol) * c.shots.rimClank],
          );
          duel.rim = 0.8;
          sound('rim');
          say('OFF THE IRON. Scramble!');
        }
      }
    } else if (duel.ballState === 'inbound') {
      ball.setNextKinematicTranslation(level.inbound);
      duel.inboundClock -= dt;
      if (duel.inboundStage === 'position' && duel.inboundClock <= 0) {
        duel.inboundStage = 'pass';
        duel.inboundClock = c.inbound.passWindow;
        sound('whistle');
        say(
          duel.inboundOwner === 0
            ? 'Pass window open — ✕ / A / E to inbound!'
            : 'CPU inbounding. Deny the pass!',
        );
      } else if (duel.inboundStage === 'pass' && duel.inboundClock <= 0) {
        duel.violations++;
        inbound(1 - duel.inboundOwner, 'violation');
      }
    } else if (duel.ballState === 'scored') {
      duel.resetTimer -= dt;
      if (duel.resetTimer <= 0) inbound(duel.nextOwner, 'score');
    }
    const v = ball.translation();
    duel.ball.x = v.x;
    duel.ball.y = v.y;
    duel.ball.z = v.z;
    const bounds = level.bounds;
    if (
      duel.ballState === 'loose' &&
      (v.x < bounds.minX ||
        v.x > bounds.maxX ||
        v.z < bounds.minZ ||
        v.z > bounds.maxZ ||
        v.y < c.ball.outDepth)
    )
      inbound(1 - duel.lastTouch, 'oob');
  }
  if (import.meta.env?.DEV) motionAudit.runtime(duel);
  // ---- low-frequency HUD snapshot
  duel.hudTimer += dt;
  if (duel.hudTimer >= c.effects.hudInterval) {
    duel.hudTimer = 0;
    useGameStore.setState((state) => createHudSnapshot(duel, state, HUD_SETTINGS));
  }
}
