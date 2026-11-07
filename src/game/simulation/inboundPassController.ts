import type { World } from '@dimforge/rapier3d-compat';
import type { RapierRigidBody } from '@react-three/rapier';
import type { GameConfig } from '../data/gameConfig';
import { syncBallCollision } from '../physics/ballCollision';
import type { DuelState } from './runtime';
import type { PlayerSlot, PhysicalInboundPass } from './types';
import {
  crossesDefenderReach,
  isOnCourt,
  planInboundPass,
  sweptDistanceSquared,
  type PassCourt,
  type PassPoint,
} from './tacticalPass';

interface InboundPassOptions {
  runtime: DuelState;
  bodies: { players: (RapierRigidBody | null)[]; ball: RapierRigidBody | null };
  config: GameConfig;
  court: PassCourt;
  source: PassPoint;
  getCatchTarget: (slot: PlayerSlot) => PassPoint;
  onPossession: (slot: PlayerSlot, intercepted: boolean) => void;
  onMessage: (text: string) => void;
  onOutOfBounds: () => void;
  onLaunch?: () => void;
  onDeflection?: () => void;
}

function available(mode: string): boolean {
  return mode !== 'down' && mode !== 'stun' && mode !== 'dunk';
}

/** Owns physical inbound flights. No per-frame React state and no position/homing writes. */
export function createInboundPassController(options: InboundPassOptions) {
  const { runtime, bodies, config, court, getCatchTarget } = options;
  const settings = config.inbound.passing;
  const gravity = {
    x: config.physics.gravity[0],
    y: config.physics.gravity[1],
    z: config.physics.gravity[2],
  };
  const position = (slot: PlayerSlot): PassPoint =>
    bodies.players[slot]?.translation() ?? {
      x: runtime.players[slot].x,
      y: config.physics.bodyY,
      z: runtime.players[slot].z,
    };

  function deflect(contact: NonNullable<PhysicalInboundPass['contact']>) {
    const flight = runtime.inboundPass;
    if (!flight || runtime.ballState !== 'pass') return;
    flight.contact = contact;
    flight.outcome = contact === 'floor' ? 'missed' : 'deflected';
    runtime.passDeflections++;
    runtime.ballState = 'loose';
    runtime.looseTimer = config.ball.pickupDelay;
    // The contact solver already supplied the rebound velocity. Keep it intact.
    syncBallCollision(bodies.ball, runtime.ballState);
    options.onDeflection?.();
    options.onMessage(
      contact === 'backboard'
        ? 'LOB OFF THE GLASS. Scramble!'
        : contact === 'rim'
          ? 'LOB OFF THE IRON. Scramble!'
          : 'Pass broken up. Loose ball!',
    );
  }

  function launch(receiver: PlayerSlot): boolean {
    if (
      runtime.ballState === 'inbound' &&
      runtime.inboundOwner === receiver &&
      runtime.inboundStage === 'position'
    ) {
      options.onMessage('Hold it — positioning first.');
      return false;
    }
    if (
      runtime.ballState !== 'inbound' ||
      runtime.inboundStage !== 'pass' ||
      runtime.inboundOwner !== receiver ||
      !available(runtime.players[receiver].mode)
    )
      return false;
    const ball = bodies.ball;
    if (!ball) return false;
    const defender = (1 - receiver) as PlayerSlot;
    const receiverPosition = position(receiver);
    const defenderPosition = position(defender);
    const plan = planInboundPass(
      options.source,
      receiverPosition,
      getCatchTarget(receiver),
      defenderPosition,
      config.player[runtime.players[defender].legend].height,
      gravity,
      court,
      settings,
    );
    if (!plan) {
      options.onMessage('Get both feet and your hands on the court before the pass.');
      return false;
    }
    runtime.inboundPass = {
      ...plan,
      receiver,
      elapsed: 0,
      previousBall: { ...plan.source },
      previousReceiver: getCatchTarget(receiver),
      previousDefender: defenderPosition,
      lastVelocity: { ...plan.velocity },
      enteredCourt: false,
      outcome: 'flying',
      contact: null,
    };
    runtime.ballState = 'pass';
    runtime.owner = -1;
    runtime.lastTouch = receiver;
    runtime.passes++;
    if (plan.type === 'lob') runtime.lobPasses++;
    else runtime.chestPasses++;
    // Set body mode before the launch impulse: a kinematic -> dynamic switch
    // invalidates any velocity written while it was still kinematic.
    syncBallCollision(ball, runtime.ballState);
    ball.setTranslation(plan.source, true);
    ball.setGravityScale(1, true);
    ball.setLinvel(plan.velocity, true);
    options.onLaunch?.();
    options.onMessage(
      plan.type === 'chest'
        ? 'CHEST PASS. Meet the ball.'
        : plan.risky
          ? 'TIGHT TO THE GLASS. Risky lob!'
          : 'LOB PASS. Go get it.',
    );
    return true;
  }

  function afterPhysicsStep(world: World): void {
    const flight = runtime.inboundPass;
    const ball = bodies.ball;
    if (!flight || !ball || runtime.ballState !== 'pass') return;
    const dt = world.timestep;
    flight.elapsed += dt;
    const current = ball.translation();
    const velocity = ball.linvel();
    runtime.ball = { ...current };

    // Read contacts immediately after each physics step. React's collision callback
    // may arrive after several substeps, once a fast ball has already bounced away.
    let contact: PhysicalInboundPass['contact'] = null;
    const collider = ball.collider(0);
    world.contactPairsWith(collider, (other) => {
      world.contactPair(collider, other, (manifold) => {
        if (manifold.numContacts() === 0) return;
        const data = other.parent()?.userData;
        if (!data || typeof data !== 'object' || !('kind' in data)) return;
        if (data.kind === 'floor') contact = 'floor';
        if (data.kind === 'hoop') {
          contact =
            'part' in data && data.part === 'backboard'
              ? 'backboard'
              : 'part' in data && data.part === 'rim'
                ? 'rim'
                : 'structure';
        }
      });
    });
    const deltaVelocity = Math.hypot(
      velocity.x - flight.lastVelocity.x - gravity.x * dt,
      velocity.y - flight.lastVelocity.y - gravity.y * dt,
      velocity.z - flight.lastVelocity.z - gravity.z * dt,
    );
    if (contact || deltaVelocity > settings.deflectionVelocityDelta) {
      deflect(contact ?? 'structure');
      return;
    }

    const defender = (1 - flight.receiver) as PlayerSlot;
    const guard = runtime.players[defender];
    const defenderPosition = position(defender);
    if (
      guard.prevR &&
      guard.interceptUntil >= runtime.time &&
      available(guard.mode) &&
      crossesDefenderReach(
        flight.previousBall,
        current,
        flight.previousDefender,
        defenderPosition,
        settings.interceptMinHeight,
        config.player[guard.legend].height + settings.interceptReachAboveHead,
        settings.interceptRadius + config.ball.radius,
      )
    ) {
      flight.outcome = 'intercepted';
      options.onPossession(defender, true);
      return;
    }

    const inside = isOnCourt(current, court);
    flight.enteredCourt ||= inside;
    if (flight.enteredCourt && !inside) {
      flight.outcome = 'out';
      options.onOutOfBounds();
      return;
    }

    const hands = getCatchTarget(flight.receiver);
    const receiverPosition = position(flight.receiver);
    flight.risky ||=
      flight.type === 'lob' &&
      Math.hypot(receiverPosition.x - court.basket.x, receiverPosition.z - court.basket.z) <=
        settings.deepPaintRadius;
    const relativeStart = {
      x: flight.previousBall.x - flight.previousReceiver.x,
      y: flight.previousBall.y - flight.previousReceiver.y,
      z: flight.previousBall.z - flight.previousReceiver.z,
    };
    const relativeEnd = { x: current.x - hands.x, y: current.y - hands.y, z: current.z - hands.z };
    if (
      !flight.risky &&
      inside &&
      flight.elapsed >= settings.minFlightTime &&
      available(runtime.players[flight.receiver].mode) &&
      sweptDistanceSquared(relativeStart, relativeEnd, { x: 0, y: 0, z: 0 }) <=
        settings.catchRadius ** 2
    ) {
      flight.outcome = 'caught';
      options.onPossession(flight.receiver, false);
      return;
    }
    if (flight.elapsed > flight.duration + settings.catchGrace) {
      flight.outcome = 'missed';
      runtime.ballState = 'loose';
      runtime.looseTimer = config.ball.pickupDelay;
      syncBallCollision(ball, runtime.ballState);
      options.onMessage('Pass missed. Scramble for it!');
    }
    flight.previousBall = { ...current };
    flight.previousReceiver = hands;
    flight.previousDefender = defenderPosition;
    flight.lastVelocity = { ...velocity };
  }
  return { launch, afterPhysicsStep };
}
