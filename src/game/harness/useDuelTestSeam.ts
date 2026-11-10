import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import { Vector3 } from 'three';
import { config, level } from '../data/gameConfig';
import { duel, bodies, resetDuel, skillInputs } from '../entities/Duel';
import { useGameStore } from '../state/gameStore';
import { useInputStore } from '../state/inputStore';
import { useHarnessStore } from '../state/harnessStore';
import { extendTestSeam } from './exposeTestSeam';
import { readCharacterPose, readHandContacts } from './characterPose';
import { locomotionDebug } from '../entities/locomotionDebug';
import { rightStickDebug } from '../input/rightStickDebug';

/** Keep test adapters out of the scene's rendering and simulation components. */
export function useDuelTestSeam(): void {
  const camera = useThree((state) => state.camera);
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);

  useEffect(() => {
    const wait = (frames = 1) =>
      new Promise<void>((resolve) => {
        window.setTimeout(resolve, (Math.max(0, frames) * 1000) / config.physics.timestep);
      });
    const projection = new Vector3();
    const renderedBall = new Vector3();
    const seam = extendTestSeam({
      ready: true,
      getRightStickDebug: (slot) => structuredClone(rightStickDebug[slot]),
      getLocomotion: (slot) => structuredClone(locomotionDebug[slot]),
      getHandContacts: (slot) =>
        readHandContacts(scene.getObjectByName(`character-${slot}`) ?? scene),
      inspectCharacter: (view) => useHarnessStore.getState().setInspectionView(view),
      setHandling: (slot, mode, hand) => {
        if (!useHarnessStore.getState().testMode || duel.owner !== slot) return;
        if (mode === 'hold') useInputStore.getState().flush();
        duel.players[slot].handling = mode;
        duel.players[slot].hand = hand;
      },
      setFacing: (slot, angle) => {
        if (useHarnessStore.getState().testMode && Number.isFinite(angle))
          duel.players[slot].angle = angle;
      },
      requestInboundPass: (receiver = 0) => useGameStore.getState().requestInboundPass(receiver),
      getCharacterPose: (slot) => readCharacterPose(scene, slot, bodies.players[slot]),
      getState: () => ({
        ...useGameStore.getState(),
        input: useInputStore.getState(),
        player: {
          ...duel.players[0],
          grip: { ...duel.players[0].grip },
          y: bodies.players[0]?.translation().y,
          mass: bodies.players[0]?.mass(),
          linvel: bodies.players[0]?.linvel(),
        },
        opponent: {
          ...duel.players[1],
          grip: { ...duel.players[1].grip },
          y: bodies.players[1]?.translation().y,
          mass: bodies.players[1]?.mass(),
          linvel: bodies.players[1]?.linvel(),
        },
        ball: {
          ...duel.ball,
          state: duel.ballState,
          owner: duel.owner,
          velocity: bodies.ball?.linvel(),
          gravityScale: bodies.ball?.gravityScale(),
          sensor: bodies.ball?.collider(0).isSensor(),
          bodyType: bodies.ball?.bodyType(),
          rendered: bodies.ballMesh
            ? { ...bodies.ballMesh.getWorldPosition(renderedBall) }
            : { ...duel.ball },
        },
        ballControl: structuredClone(duel.ballControl),
        skillInput: skillInputs.map((input) => structuredClone(input.debug)),
        inboundPass: duel.inboundPass ? structuredClone(duel.inboundPass) : null,
        passes: duel.passes,
        chestPasses: duel.chestPasses,
        lobPasses: duel.lobPasses,
        passDeflections: duel.passDeflections,
        inbound:
          duel.ballState === 'inbound'
            ? { stage: duel.inboundStage, clock: duel.inboundClock, owner: duel.inboundOwner }
            : null,
        catches: duel.catches,
        jabs: duel.jabs,
        bites: duel.bites,
        dribbles: duel.dribbles,
        violations: duel.violations,
        bumps: duel.bumps,
        defensePushes: duel.defensePushes,
        shots: duel.shots,
        dunks: duel.dunks,
        smashes: duel.smashes,
        flops: duel.flops,
        fumbles: duel.fumbles,
        pickups: duel.pickups,
        interceptions: duel.interceptions,
        rim: duel.rim,
        time: duel.time,
      }),
      getEntities: () => [
        { id: 'player', type: 'player', position: bodies.players[0]?.translation() },
        { id: 'opponent', type: 'opponent', position: bodies.players[1]?.translation() },
        { id: 'ball', type: duel.ballState, position: bodies.ball?.translation() },
        { id: 'hoop', type: 'static', position: level.hoop },
        { id: 'court', type: 'static', active: true },
      ],
      project: (position) => {
        projection.set(...position).project(camera);
        const rect = gl.domElement.getBoundingClientRect();
        return {
          x: rect.left + ((projection.x + 1) / 2) * rect.width,
          y: rect.top + ((1 - projection.y) / 2) * rect.height,
        };
      },
      setLegend: (slot, legend) => useGameStore.getState().choose(slot, legend),
      getGrip: (slot) => ({ grip: { ...duel.players[slot].grip }, ball: { ...duel.ball } }),
      press: async (action, frames = 1) => {
        const key =
          action === 'inbound' || action === 'INBOUND' || action === 'E'
            ? 'inbound'
            : action === 'Q' || action === 'post' || action === 'actionB'
              ? 'actionB'
              : 'actionA';
        useInputStore.getState().setAction(key, true);
        try {
          await wait(frames);
        } finally {
          useInputStore.getState().setAction(key, false);
        }
        await wait(2);
      },
      step: wait,
      reset: async (seed = 42, scenario) => {
        useHarnessStore.getState().setSeed(seed);
        useGameStore.getState().reset();
        resetDuel(seed, scenario);
        await wait(2);
      },
      teleport: (id, position) => {
        const body =
          id === 'player'
            ? bodies.players[0]
            : id === 'opponent'
              ? bodies.players[1]
              : id === 'ball'
                ? bodies.ball
                : null;
        body?.setTranslation({ x: position[0], y: position[1], z: position[2] }, true);
        body?.setLinvel({ x: 0, y: 0, z: 0 }, true);
        const fighter =
          id === 'player' ? duel.players[0] : id === 'opponent' ? duel.players[1] : null;
        if (fighter) {
          // a teleport cancels all motion state: ramped velocity and pending shove impulses
          fighter.moveVX = 0;
          fighter.moveVZ = 0;
          fighter.vx = 0;
          fighter.vz = 0;
        }
        if (id === 'ball') {
          duel.ballState = 'loose';
          duel.owner = -1;
          duel.looseTimer = config.ball.pickupDelay;
          body?.setGravityScale(1, true);
        }
      },
    });

    return () => {
      if (window.__TEST__ === seam) delete window.__TEST__;
    };
  }, [camera, gl, scene]);
}
