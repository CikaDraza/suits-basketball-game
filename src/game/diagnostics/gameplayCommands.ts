import type { DiagnosticEvent } from './recorder';
import type { AnimationObservation } from './motionAudit';
import type { DuelState } from '../simulation/runtime';

type Evidence = { simulationTime: number; data: Record<string, unknown> };
export interface GameplayCommand {
  id: number;
  slot: number;
  revision: number;
  action: string;
  requestedAt: number;
  decision: { stage: string; reason?: string } | null;
  execution: Evidence | null;
  observation: Evidence | null;
  ended: boolean;
}

/** A bounded projection of diagnostic events, never a gameplay/animation authority. */
export function createGameplayCommands(limit = 32) {
  const commands: GameplayCommand[][] = [[], []];
  const read = (slot: number) => commands[slot] ?? [];
  return {
    observe(event: DiagnosticEvent) {
      if (event.type === 'session.begin') {
        commands.forEach((rows) => rows.splice(0));
        return;
      }
      if (event.slot === undefined) return;
      const rows = read(event.slot);
      if (event.type === 'command.requested' && event.action) {
        rows.push({
          id: event.sequence,
          slot: event.slot,
          revision: event.revision,
          action: event.action,
          requestedAt: event.simulationTime,
          decision: null,
          execution: null,
          observation: null,
          ended: false,
        });
        if (rows.length > limit) rows.shift();
        return;
      }
      const row = rows.find((row) => row.id === event.commandId && row.revision === event.revision);
      if (!row) return;
      const evidence = () => ({
        simulationTime: event.simulationTime,
        data: structuredClone(event.data ?? {}) as Record<string, unknown>,
      });
      if (event.type === 'command.executed') row.execution ??= evidence();
      else if (event.type === 'animation.active') row.observation = evidence();
      else if (event.type === 'command.ended') row.ended = true;
      else if (event.type.startsWith('command.'))
        row.decision = { stage: event.type.slice('command.'.length), reason: event.reason };
    },
    view(slot: number) {
      return structuredClone(read(slot)).reverse();
    },
    latest(slot: number, action: string) {
      const rows = read(slot);
      for (let i = rows.length - 1; i >= 0; i--) if (rows[i].action === action) return rows[i];
      return undefined;
    },
    pending(slot: number) {
      const latest = new Set<string>();
      return read(slot)
        .slice()
        .reverse()
        .filter((row) => {
          if (latest.has(row.action)) return false;
          latest.add(row.action);
          return (
            row.execution &&
            !row.observation &&
            !row.ended &&
            row.decision?.stage !== 'rejected' &&
            row.decision?.stage !== 'cancelled'
          );
        });
    },
  };
}

export const gameplayCommands = /* @__PURE__ */ createGameplayCommands();

/** Correlate a gameplay effect with final pose evidence; acceptance alone never matches. */
export function matchesGameplayPose(
  command: GameplayCommand,
  pose: AnimationObservation,
  state: DuelState,
) {
  if (!command.execution) return false;
  const player = state.players[command.slot];
  const ballArms = pose.layers.arms === 'ball-hand-ik';
  const ownsBall = state.owner === command.slot && state.ballState === 'held';
  if (command.action === 'move') return !!pose.locomotion?.moving;
  if (command.action === 'stance_or_special') return pose.mode === command.execution.data.mode;
  if (command.action.startsWith('defense_'))
    return pose.layers.arms === 'defensive-arm-ik' && command.action === `defense_${pose.defense}`;
  if (command.action.startsWith('crossover_'))
    return (
      ownsBall &&
      ballArms &&
      state.ballControl.skill?.started === true &&
      command.action === `crossover_${state.ballControl.skill.kind}`
    );
  if (command.action === 'shoot_charge') return ownsBall && ballArms && player.charge > 0;
  if (command.action === 'shoot_release') return pose.mode === 'shoot' || pose.mode === 'dunk';
  if (command.action === 'contest' || command.action === 'intercept_window')
    return pose.mode === 'contest';
  if (command.action === 'hand_change')
    return ownsBall && ballArms && player.hand === command.execution.data.hand;
  if (command.action === 'jab') return player.jab > 0;
  if (command.action === 'dribble')
    return ownsBall && ballArms && pose.locomotion?.upper === 'dribble';
  if (command.action === 'smash') return state.ballState === 'smash';
  return false; // E.g. an inbound launches the ball without a dedicated character clip.
}
