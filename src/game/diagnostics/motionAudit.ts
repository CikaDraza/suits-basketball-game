import type { Bone } from 'three';
import type { RapierRigidBody } from '@react-three/rapier';
import type { World } from '@dimforge/rapier3d-compat';
import { config, level } from '../data/gameConfig';
import { ANIMATION_PATHS, MODEL_PATHS } from '../assets/manifest';
import type { GameSession } from '../state/gameStore';
import type { ControlProfile } from '../input/controlBindings';
import type { DuelState } from '../simulation/runtime';
import type { LocomotionSnapshot } from '../entities/locomotionDebug';
import type { createDefensiveArmContact } from '../entities/defensiveArmContact';
import type { createHandContactPose } from '../entities/handContactPose';
import type { GestureAudit } from './gestureAudit';
import {
  evaluateArmRules,
  evaluateReachRules,
  MOTION_THRESHOLDS,
  type MotionWarning,
} from './rules';
import { motionRecorder as recorder } from './recorder';
import { gameplayCommands, matchesGameplayPose } from './gameplayCommands';

type Bodies = { players: (RapierRigidBody | null)[]; ball: RapierRigidBody | null };
type Decision = { commandId: number; action: string; stage: string; reason?: string };
const executedCommands = new Set<number>();
const lastDecision: (Decision | null)[] = [null, null];
const commandIds = new WeakMap<object, number>();
let tick = 0;
let runtime: DuelState | null = null;
let lastRuntimeSample = -1;
const lastPoseSample = [-1, -1];
const poseKeys = ['', ''];
const runtimeKeys = new Map<string, string>();
const inputKeys = ['', ''];
const physicalKeys = ['', ''];
const warningKeys = ['', ''];
const latestInputIds = [0, 0];
const handCommands: (Decision | null)[] = [null, null];
const movementCommands: ({ id: number; x: number; z: number } | null)[] = [null, null];
const inboundCommands = new Map<number, { id: number; slot: number }>();
let lastContactKey = '';
const live = {
  inputs: [null, null] as (unknown | null)[],
  gamepads: [null, null] as (unknown | null)[],
  animation: [null, null] as (AnimationObservation | null)[],
  physics: null as unknown,
  warnings: [[], []] as MotionWarning[][],
  physicalInput: [null, null] as ({ source: string; data: unknown } | null)[],
};
export interface AnimationObservation {
  mode: string;
  phase: { remaining: number; push: number; ball: number };
  defense: string;
  layers: Record<string, string>;
  locomotion: LocomotionSnapshot | null;
}
function request(slot: number, action: string, data: unknown = {}) {
  const id = recorder.event(
    'command.requested',
    { inputId: latestInputIds[slot], ...(data as object) },
    { slot, action },
  );
  lastDecision[slot] = { commandId: id, action, stage: 'requested' };
  return id;
}
function decision(slot: number, commandId: number, action: string, stage: string, reason?: string) {
  recorder.event(`command.${stage}`, {}, { slot, commandId, action, reason });
  lastDecision[slot] = { commandId, action, stage, reason };
}
function executed(slot: number, commandId: number, action: string, data: unknown = {}) {
  if (executedCommands.has(commandId)) return;
  executedCommands.add(commandId);
  if (executedCommands.size > recorder.limits.maxEvents)
    executedCommands.delete(executedCommands.values().next().value!);
  recorder.event('command.executed', data, { slot, commandId, action });
  if (lastDecision[slot]?.commandId === commandId)
    lastDecision[slot] = { commandId, action, stage: 'executed' };
}
function changed(type: string, key: string, data: unknown, slot?: number) {
  const encoded = JSON.stringify(data);
  if (runtimeKeys.get(key) === encoded) return;
  runtimeKeys.set(key, encoded);
  recorder.event(type, data, { slot });
}
function snapshot(state: DuelState, bodies: Bodies) {
  return {
    phase: 'after-physics',
    input: { resolved: live.inputs, gamepads: live.gamepads },
    seed: state.seed,
    score: [...state.score],
    players: state.players.map((p, slot) => ({
      active: !!bodies.players[slot],
      legend: p.legend,
      position: bodies.players[slot]?.translation() ?? null,
      velocity: bodies.players[slot]?.linvel() ?? null,
      facing: p.angle,
      opponentDirection: bodies.players[1 - slot]
        ? Math.atan2(state.players[1 - slot].x - p.x, state.players[1 - slot].z - p.z)
        : null,
      mode: p.mode,
      defenseHands: p.defenseHands,
      handling: p.handling,
      charge: p.charge,
      energy: p.energy,
      requestedMovement: p.moving,
      controlledVelocity: { x: p.moveVX, z: p.moveVZ },
    })),
    ball: {
      active: !!bodies.ball,
      state: state.ballState,
      owner: state.owner,
      position: bodies.ball?.translation() ?? null,
      velocity: bodies.ball?.linvel() ?? null,
      control: {
        owner: state.ballControl.owner,
        mode: state.ballControl.mode,
        hand: state.ballControl.hand,
        phase: state.ballControl.phase,
        crossing: state.ballControl.crossing,
        skill: state.ballControl.skill ? { ...state.ballControl.skill } : null,
      },
    },
    inbound:
      state.ballState === 'inbound'
        ? { owner: state.inboundOwner, stage: state.inboundStage, remaining: state.inboundClock }
        : null,
  };
}
export const motionAudit = {
  request,
  decision,
  executed,
  confirm(slot: number, action: string, data: unknown) {
    const command = gameplayCommands.latest(slot, action);
    if (command?.decision?.stage === 'accepted' && !command.execution)
      executed(slot, command.id, action, data);
  },
  end(slot: number, action: string) {
    const command = gameplayCommands.latest(slot, action);
    if (command && !command.ended)
      recorder.event('command.ended', {}, { slot, commandId: command.id, action });
  },
  begin(state: DuelState, session: GameSession, profile: ControlProfile, bodies: Bodies) {
    runtime = state;
    executedCommands.clear();
    tick = 0;
    lastRuntimeSample = -1;
    lastPoseSample.fill(-1);
    poseKeys.fill('');
    inputKeys.fill('');
    physicalKeys.fill('');
    warningKeys.fill('');
    latestInputIds.fill(0);
    lastDecision.fill(null);
    handCommands.fill(null);
    movementCommands.fill(null);
    inboundCommands.clear();
    live.inputs.fill(null);
    live.gamepads.fill(null);
    live.animation.fill(null);
    live.physics = null;
    live.physicalInput.fill(null);
    live.warnings = [[], []];
    runtimeKeys.clear();
    lastContactKey = '';
    recorder.setCheckpoint(() => ({ simulation: state, physics: snapshot(state, bodies) }));
    // Reset mutates the existing Duel object before this new epoch is installed.
    // Flush/cancel events in that interval still belong to the previous clock.
    const revision = state.revision;
    let simulationTime = state.time;
    recorder.setClock(() => {
      if (state.revision === revision) simulationTime = state.time;
      return { revision, tick, simulationTime };
    });
    recorder.context(
      {
        build:
          typeof __SUITS_DIAGNOSTIC_BUILD__ === 'undefined'
            ? { version: 'unknown' }
            : __SUITS_DIAGNOSTIC_BUILD__,
        session,
        legends: state.players.map((p) => p.legend),
        models: MODEL_PATHS,
        animations: ANIMATION_PATHS,
        config,
        level,
        controls: profile,
        thresholds: MOTION_THRESHOLDS,
        physics: { timestep: 1 / config.physics.timestep, gravity: config.physics.gravity },
        environment: {
          userAgent: navigator.userAgent,
          hardwareConcurrency: navigator.hardwareConcurrency,
          viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio },
        },
        initialSeed: state.seed,
      },
      { simulation: state, physics: snapshot(state, bodies) },
    );
  },
  beginTick() {
    tick++;
  },
  input(source: string, data: unknown, slot = 0) {
    latestInputIds[slot] = recorder.event(`input.${source}`, data, { slot });
    if (source === 'keyboard' || source === 'bridge') live.physicalInput[slot] = { source, data };
  },
  physicalPad(slot: number, pad: Gamepad | null, mapped: unknown, gate: string | null) {
    const data = {
      device: pad?.id ?? null,
      layout: {
        axes: pad?.axes.length ?? 0,
        buttons: pad?.buttons.length ?? 0,
        truncated: !!pad && (pad.axes.length > 32 || pad.buttons.length > 32),
      },
      axes: pad ? Array.from(pad.axes).slice(0, 32) : [],
      buttons: pad
        ? Array.from(pad.buttons)
            .slice(0, 32)
            .map((b, index) => ({ index, value: b.value, pressed: b.pressed }))
        : [],
      mapped,
      gate,
    };
    live.gamepads[slot] = data;
    const key = JSON.stringify(
      {
        device: data.device,
        axes: data.axes,
        buttons: data.buttons,
        gate,
        context: (mapped as { context?: string }).context,
      },
      (_k, v: unknown) => (typeof v === 'number' ? Math.round(v * 100) / 100 : v),
    );
    if (key !== physicalKeys[slot]) {
      physicalKeys[slot] = key;
      this.input('gamepad', data, slot);
    }
  },
  resolvedInput(
    slot: number,
    input: { x: number; z: number; q: boolean; r: boolean; hand?: number; inbound?: boolean },
    source: string,
  ) {
    live.inputs[slot] = { source, ...input };
    const key = JSON.stringify([
      input.x.toFixed(2),
      input.z.toFixed(2),
      input.q,
      input.r,
      input.hand,
      input.inbound,
    ]);
    if (key !== inputKeys[slot]) {
      inputKeys[slot] = key;
      recorder.event('input.resolved', { source, ...input }, { slot });
      const p = runtime!.players[slot];
      if (Math.hypot(input.x, input.z) > config.player.minMove && movementCommands[slot] === null) {
        const id = request(slot, 'move');
        movementCommands[slot] = { id, x: p.x, z: p.z };
        const reason = ['down', 'stun', 'dunk'].includes(p.mode)
          ? `mode-${p.mode}`
          : runtime!.owner === slot && p.handling === 'hold'
            ? 'tap-hold-classification'
            : null;
        decision(slot, id, 'move', reason ? 'deferred' : 'accepted', reason ?? undefined);
      } else if (
        Math.hypot(input.x, input.z) <= config.player.minMove &&
        movementCommands[slot] !== null
      ) {
        recorder.event(
          'command.ended',
          {},
          { slot, action: 'move', commandId: movementCommands[slot]!.id },
        );
        movementCommands[slot] = null;
      }
    }
  },
  gesture(slot: number, context: 'offense' | 'defense', event: GestureAudit) {
    const action =
      event.action ??
      (context === 'defense'
        ? event.gesture.kind === 'front'
          ? 'defense_up'
          : event.gesture.kind === 'behind'
            ? 'defense_brace'
            : event.gesture.hand === 1
              ? 'defense_left'
              : 'defense_right'
        : `crossover_${event.gesture.kind}`);
    let id = commandIds.get(event.gesture);
    if (event.stage === 'requested' || !id) {
      id = request(slot, action, { gesture: event.gesture });
      commandIds.set(event.gesture, id);
    }
    if (event.stage !== 'requested') decision(slot, id, action, event.stage, event.reason);
    if (context === 'defense' && event.stage === 'accepted')
      handCommands[slot] = { commandId: id, action, stage: 'accepted' };
  },
  gestureId(gesture: object) {
    return commandIds.get(gesture) ?? 0;
  },
  handCommand(slot: number) {
    return handCommands[slot];
  },
  queueInbound(requestId: number, id: number, slot: number) {
    for (const previous of inboundCommands.values())
      decision(previous.slot, previous.id, 'inbound', 'cancelled', 'superseded-inbound-request');
    inboundCommands.clear();
    inboundCommands.set(requestId, { id, slot });
    // At most one request is consumed per tick; keep cancelled/replaced IDs bounded.
    if (inboundCommands.size > 32) inboundCommands.delete(inboundCommands.keys().next().value!);
  },
  resolveInbound(requestId: number, success: boolean, reason?: string, data: unknown = {}) {
    const command = inboundCommands.get(requestId);
    if (!command) return;
    decision(command.slot, command.id, 'inbound', success ? 'accepted' : 'rejected', reason);
    if (success) executed(command.slot, command.id, 'inbound', data);
    inboundCommands.delete(requestId);
  },
  runtime(state: DuelState) {
    state.players.forEach((p, slot) => {
      changed(
        'state.player',
        `player-${slot}`,
        { mode: p.mode, handling: p.handling, hand: p.hand, defenseHands: p.defenseHands },
        slot,
      );
    });
    changed('ball.state', 'ball', {
      state: state.ballState,
      owner: state.owner,
      lastTouch: state.lastTouch,
    });
    changed('skill.state', 'skill', {
      owner: state.ballControl.owner,
      skill: state.ballControl.skill ? { ...state.ballControl.skill } : null,
    });
    changed('score.changed', 'score', state.score);
  },
  physics(world: World, state: DuelState, bodies: Bodies) {
    const pairs: { slot: number; other: string; collider: number }[] = [];
    bodies.players.forEach((body, slot) => {
      if (!body || body.numColliders() === 0) return;
      const movement = movementCommands[slot];
      if (movement && !executedCommands.has(movement.id)) {
        const position = body.translation();
        const distance = Math.hypot(position.x - movement.x, position.z - movement.z);
        // Diagnostic evidence threshold (1 cm), independent of commanded velocity.
        if (state.players[slot].moving > config.player.minMove && distance > 0.01) {
          decision(slot, movement.id, 'move', 'accepted');
          executed(slot, movement.id, 'move', { evidence: 'measured-body-travel', distance });
        }
      }
      world.contactPairsWith(body.collider(0), (other) => {
        let touching = false;
        world.contactPair(body.collider(0), other, (manifold) => {
          if (manifold.numSolverContacts() > 0) touching = true;
        });
        if (touching)
          pairs.push({
            slot,
            other:
              bodies.players[1 - slot] &&
              other.parent()?.handle === bodies.players[1 - slot]!.handle
                ? 'opponent'
                : bodies.ball && other.parent()?.handle === bodies.ball.handle
                  ? 'ball'
                  : 'environment',
            collider: other.handle,
          });
      });
    });
    const key = JSON.stringify(pairs);
    if (key !== lastContactKey) {
      lastContactKey = key;
      recorder.event('physics.contacts', { pairs });
    }
    if (state.time - lastRuntimeSample < 1 / recorder.limits.sampleHz - 1e-6) return;
    lastRuntimeSample = state.time;
    live.physics = snapshot(state, bodies);
    recorder.sample('simulation', live.physics);
  },
  pose(
    slot: number,
    observation: AnimationObservation,
    bones: Readonly<Record<string, Bone | undefined>>,
    arms: ReturnType<typeof createDefensiveArmContact>,
    hands: ReturnType<typeof createHandContactPose>,
  ) {
    const key = JSON.stringify([
      observation.mode,
      observation.defense,
      observation.layers,
      observation.locomotion?.locomotion,
      observation.locomotion?.posture,
      observation.locomotion?.upper,
      observation.locomotion?.importedDefense?.phase,
    ]);
    live.animation[slot] = observation;
    if (key !== poseKeys[slot]) {
      const previous = poseKeys[slot];
      poseKeys[slot] = key;
      if (previous) recorder.event('animation.ended', { previous: JSON.parse(previous) }, { slot });
      recorder.event('animation.active', observation, { slot });
    }
    const command = handCommands[slot];
    if (
      command &&
      arms.active &&
      observation.layers.arms === 'defensive-arm-ik' &&
      `defense_${observation.defense}` === command.action
    )
      executed(slot, command.commandId, command.action, {
        evidence: 'final-defensive-arm-ik',
        layer: observation.layers.arms,
      });
    if (runtime)
      for (const pending of gameplayCommands.pending(slot))
        if (
          runtime.time - pending.execution!.simulationTime < 3 &&
          matchesGameplayPose(pending, observation, runtime)
        )
          recorder.event('animation.active', observation, { slot, commandId: pending.id });
    if (!runtime || runtime.time - lastPoseSample[slot] < 1 / recorder.limits.sampleHz - 1e-6)
      return;
    lastPoseSample[slot] = runtime.time;
    const measured = arms.solvers.map((solver) => ({ ...solver.debug }));
    const warnings = [
      ...evaluateArmRules(measured),
      ...evaluateReachRules(
        observation.defense,
        runtime.players[slot].angle,
        measured,
        hands.arms.map((a) => a.debug.normal),
      ),
    ];
    live.warnings[slot] = warnings;
    const warningsKey = JSON.stringify(warnings.map((w) => [w.rule, w.part]));
    if (warningsKey !== warningKeys[slot]) {
      warningKeys[slot] = warningsKey;
      recorder.event(
        'diagnostic.thresholds',
        { warnings, certainty: 'measured-threshold-check', thresholds: MOTION_THRESHOLDS },
        { slot },
      );
    }
    recorder.sample(
      'pose',
      {
        ...observation,
        joints: Object.fromEntries(
          Object.entries(bones).flatMap(([name, bone]) =>
            bone
              ? [
                  [
                    name,
                    {
                      position: { ...bone.getWorldPosition(bone.position.clone()) },
                      quaternion: bone.quaternion.toArray(),
                      space: 'world-position/local-quaternion',
                    },
                  ],
                ]
              : [],
          ),
        ),
        defensiveArms: measured,
        ballHands: hands.arms.map((arm) => ({ ...arm.debug })),
        warnings,
      },
      slot,
    );
  },
  view(slot: number) {
    return {
      ...live,
      decision: lastDecision[slot],
      input: live.inputs[slot],
      gamepad: live.gamepads[slot],
      animation: live.animation[slot],
      warnings: live.warnings[slot],
      commands: gameplayCommands.view(slot),
      physicalInput: live.physicalInput[slot],
    };
  },
};
