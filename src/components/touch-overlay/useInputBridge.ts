import { motionAudit } from '../../game/diagnostics/motionAudit';
import { motionRecorder } from '../../game/diagnostics/recorder';
import { useEffect } from 'react';
import { enableAudio } from '../../game/audio/audio';
import { useGameStore } from '../../game/state/gameStore';
import { useInputStore } from '../../game/state/inputStore';
import { clamp } from '../../game/utils/math';
import { useControlSettingsStore } from '../../game/state/controlSettingsStore';
import { GAME_INPUT_EVENT, type GameInputEvent } from './types';

const digitalActions = ['MOVE_LEFT', 'MOVE_RIGHT', 'MOVE_UP', 'MOVE_DOWN'] as const;
type DigitalAction = (typeof digitalActions)[number];

export function useInputBridge() {
  useEffect(() => {
    const digital: Record<DigitalAction, boolean> = {
      MOVE_LEFT: false,
      MOVE_RIGHT: false,
      MOVE_UP: false,
      MOVE_DOWN: false,
    };
    let analogX = 0;
    let analogZ = 0;
    const actions = {
      ACTION_A: { keyboard: false, touch: false, external: false },
      ACTION_B: { keyboard: false, touch: false, external: false },
      INBOUND: { keyboard: false, touch: false, external: false },
      HAND_LEFT: { keyboard: false, touch: false, external: false },
      HAND_RIGHT: { keyboard: false, touch: false, external: false },
    };
    const updateAxis = () =>
      useInputStore
        .getState()
        .setAxis(
          clamp(analogX + Number(digital.MOVE_RIGHT) - Number(digital.MOVE_LEFT), -1, 1),
          clamp(analogZ + Number(digital.MOVE_UP) - Number(digital.MOVE_DOWN), -1, 1),
        );
    const flush = () => {
      for (const action of digitalActions) digital[action] = false;
      analogX = 0;
      analogZ = 0;
      for (const sources of Object.values(actions)) {
        sources.keyboard = false;
        sources.touch = false;
        sources.external = false;
      }
      useInputStore.getState().flush();
    };
    const onInput = (event: Event) => {
      const detail = (event as CustomEvent<GameInputEvent>).detail;
      if (import.meta.env.DEV && detail)
        motionAudit.input('bridge', {
          ...detail,
          screen: useGameStore.getState().screen,
          gameplayBridgeEnabled: useGameStore.getState().screen === 'playing',
        });
      if (!detail || useGameStore.getState().screen !== 'playing') return;
      const { action, phase, axis, source } = detail;
      if (phase === 'down') enableAudio();
      const game = useGameStore.getState();
      if (
        action === 'INBOUND' &&
        phase === 'down' &&
        game.phase === 'INBOUND_PHASE' &&
        game.inbound?.owner === 0
      ) {
        // Preserve a short button/key tap as an intent until the next physics step.
        game.requestInboundPass();
        return;
      }
      if (action === 'MOVE' && axis && Number.isFinite(axis.x) && Number.isFinite(axis.y)) {
        analogX = axis.x;
        analogZ = -axis.y;
        updateAxis();
      }
      // Touch digitals remain available to event consumers. Movement already arrived
      // as the joystick's analog event, so adding it again would double the axis.
      if (Object.hasOwn(digital, action) && source !== 'touch') {
        digital[action as DigitalAction] = phase === 'down';
        updateAxis();
      }
      const input = useInputStore.getState();
      if (
        action === 'ACTION_A' ||
        action === 'ACTION_B' ||
        action === 'INBOUND' ||
        action === 'HAND_LEFT' ||
        action === 'HAND_RIGHT'
      ) {
        const sources = actions[action];
        sources[source ?? 'external'] = phase === 'down';
        input.setAction(
          action === 'ACTION_A'
            ? 'actionA'
            : action === 'ACTION_B'
              ? 'actionB'
              : action === 'INBOUND'
                ? 'inbound'
                : action === 'HAND_LEFT'
                  ? 'handLeft'
                  : 'handRight',
          Object.values(sources).some(Boolean),
        );
      }
    };
    const onVisibilityChange = () => {
      if (document.hidden) flush();
    };
    const unsubscribe = useGameStore.subscribe((state, previous) => {
      if (state.screen !== previous.screen || state.revision !== previous.revision) flush();
    });

    const unsubscribeSettings = useControlSettingsStore.subscribe((next, previous) => {
      if (next.profile !== previous.profile) {
        if (import.meta.env.DEV)
          motionRecorder.event('configuration.controls', { profile: next.profile });
        flush();
      }
    });
    window.addEventListener(GAME_INPUT_EVENT, onInput);
    window.addEventListener('blur', flush);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.removeEventListener(GAME_INPUT_EVENT, onInput);
      window.removeEventListener('blur', flush);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      unsubscribe();
      unsubscribeSettings();
      flush();
    };
  }, []);
}
