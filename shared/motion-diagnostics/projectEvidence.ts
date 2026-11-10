import { ANALYSIS_LIMITS, type DiagnosticRecording } from './schemas.js';
import type { EvidencePoint, PreparedEvidence } from './analysisTypes.js';
import { AnalysisError } from './errors.js';

type Dict = Record<string, unknown>;
const object = (value: unknown): Dict =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Dict) : {};
function get(value: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((v, key) => object(v)[key], value);
}
export const EVIDENCE_STATES = new Set([
  'idle',
  'post',
  'spin',
  'contest',
  'shoot',
  'down',
  'stun',
  'dunk',
  'exhausted',
  'hold',
  'dribble',
  'none',
  'left',
  'right',
  'up',
  'wave',
  'brace',
  'push',
  'wide',
  'ready',
  'held',
  'loose',
  'shot',
  'pass',
  'smash',
  'inbound',
  'scored',
  'inactive',
  'side',
  'front',
  'behind',
  'forward',
  'backward',
  'strafe',
  'upright',
  'defensive',
  'relaxed',
  'deny',
  'guard',
  'callForPass',
]);
export const EVIDENCE_ACTIONS = new Set([
  'move',
  'stance',
  'stance_or_special',
  'primary',
  'contest',
  'intercept_window',
  'shoot_charge',
  'shoot_release',
  'smash',
  'hand_change',
  'inbound',
  'defense_left',
  'defense_right',
  'defense_up',
  'defense_wave',
  'defense_brace',
  'defense_push',
  'crossover_side',
  'crossover_front',
  'crossover_behind',
]);
export const EVIDENCE_REASONS = new Set([
  'not-ball-owner',
  'ball-not-held',
  'shot-charging',
  'crossing-active',
  'active-skill-or-crossing',
  'no-opponent',
  'push-cooldown',
  'below-minimum-hold',
  'out-of-contact-range',
  'target-disabled',
  'contact-impulse',
  'moving-skill-risk',
  'steal',
  'flop',
  'exhaustion-fumble',
  'trip-contact',
  'superseded',
  'reset',
  'input-disabled',
  'device-or-input-reset',
  'mode-down',
  'mode-stun',
  'mode-dunk',
  'tap-hold-classification',
  'neutral-required',
  'positioning-not-complete',
  'launch-not-available',
  'not-inbound-receiver',
  'not-inbound-receiver-or-hud-not-ready',
]);
export const EVIDENCE_TYPES = new Set([
  'command.requested',
  'command.queued',
  'command.accepted',
  'command.rejected',
  'command.cancelled',
  'command.executed',
  'command.ended',
  'animation.active',
  'animation.ended',
  'state.player',
  'skill.state',
  'ball.state',
  'possession.lost',
  'possession.gained',
  'contact.push',
  'physics.contacts',
  'input.resolved',
  'input.gamepad',
  'input.button-edge',
  'input.axis-store',
  'input.flush',
  'session.begin',
  'session.reset',
  'session.screen',
  'inbound.started',
  'inbound.launch',
  'diagnostic.thresholds',
  'score.changed',
]);
function scalarPaths(value: unknown, paths: readonly string[]): EvidencePoint['values'] {
  const values: EvidencePoint['values'] = {};
  for (const path of paths) {
    const v = get(value, path);
    if (
      v === null ||
      typeof v === 'boolean' ||
      (typeof v === 'number' && Number.isFinite(v)) ||
      (typeof v === 'string' && EVIDENCE_STATES.has(v))
    )
      values[path] = v as number | boolean | string | null;
  }
  return values;
}
const VECTOR = ['x', 'y', 'z'] as const;
const pathsFor = (prefix: string) => VECTOR.map((v) => `${prefix}.${v}`);
function sampleValues(value: unknown): EvidencePoint['values'] {
  const root = object(value),
    physics = object(root.physics ?? root);
  const values = scalarPaths(physics, [
    'mode',
    'defense',
    'phase.remaining',
    'phase.push',
    'phase.ball',
    'ball.active',
    'ball.state',
    'ball.owner',
    'ball.control.phase',
    'ball.control.hand',
    'ball.control.crossing',
    'ball.control.skill.kind',
    ...pathsFor('ball.position'),
    ...pathsFor('ball.velocity'),
    'locomotion.locomotion',
    'locomotion.speed',
    'locomotion.phase',
    'locomotion.grounded',
  ]);
  const players = Array.isArray(physics.players) ? physics.players : [];
  players.slice(0, 2).forEach((p, slot) => {
    const fields = scalarPaths(p, [
      'active',
      'facing',
      'mode',
      'handling',
      'charge',
      'energy',
      'requestedMovement',
      ...pathsFor('position'),
      ...pathsFor('velocity'),
      ...pathsFor('controlledVelocity'),
    ]);
    for (const [key, v] of Object.entries(fields)) values[`players.${slot}.${key}`] = v;
  });
  const arms = Array.isArray(root.defensiveArms) ? root.defensiveArms : [];
  arms.slice(0, 2).forEach((a, side) => {
    for (const [key, v] of Object.entries(
      scalarPaths(a, [
        'weight',
        'elbowFlex',
        'wristBend',
        'elbowPlaneError',
        'contactError',
        ...pathsFor('shoulder'),
        ...pathsFor('elbow'),
        ...pathsFor('wrist'),
      ]),
    ))
      values[`arms.${side}.${key}`] = v;
  });
  return values;
}
const uniform = <T>(list: readonly T[], count: number): T[] =>
  list.length <= count
    ? [...list]
    : count <= 0
      ? []
      : count === 1
        ? [list[0]]
        : Array.from(
            { length: count },
            (_, i) => list[Math.round((i * (list.length - 1)) / (count - 1))],
          );
const digest = (v: unknown, length: number) =>
  typeof v === 'string' && new RegExp(`^[a-f0-9]{${length}}$`).test(v) ? v : null;

/** Allowlists, not recursive redaction: arbitrary recording strings never reach the model. */
export function projectEvidence(
  recording: DiagnosticRecording,
  parserWarnings: string[],
  recordingSha256: string,
): PreparedEvidence {
  const provenance: PreparedEvidence['provenance'] = recording.contexts.map((context) => {
    const metadata = object(context.metadata),
      session = object(metadata.session),
      build = object(metadata.build);
    const kind =
      session.kind === 'duel'
        ? 'duel'
        : session.kind === 'training' &&
            ['movement', 'solo', 'one-on-one'].includes(String(session.drill))
          ? (`training.${session.drill}` as PreparedEvidence['provenance'][number]['session'])
          : 'unknown';
    return {
      revision: context.revision,
      session: kind,
      characters: Array.isArray(metadata.legends)
        ? metadata.legends
            .filter((v): v is 'shaq' | 'chuck' => v === 'shaq' || v === 'chuck')
            .slice(0, 2)
        : [],
      commit: digest(build.commit, 40),
      dirtyAtServerStart:
        typeof build.dirtyAtServerStart === 'boolean' ? build.dirtyAtServerStart : null,
      codeSha256AtServerStart: digest(build.codeSha256AtServerStart, 64),
    };
  });
  const events: EvidencePoint[] = recording.events
    .filter((e) => EVIDENCE_TYPES.has(e.type))
    .map((e) => ({
      kind: 'event',
      sequence: e.sequence,
      revision: e.revision,
      tick: e.tick,
      simulationTime: e.simulationTime,
      elapsedMs: e.elapsedMs,
      type: e.type,
      ...(e.slot !== undefined ? { slot: e.slot } : {}),
      ...(e.commandId !== undefined ? { commandId: e.commandId } : {}),
      ...(e.action && EVIDENCE_ACTIONS.has(e.action) ? { action: e.action } : {}),
      ...(e.reason && EVIDENCE_REASONS.has(e.reason) ? { reason: e.reason } : {}),
      values: scalarPaths(e.data, [
        'x',
        'z',
        'q',
        'r',
        'inbound',
        'hand',
        'mode',
        'handling',
        'defenseHands',
        'owner',
        'state',
        'hand',
        'target',
        'applied',
        'gesture.hand',
        'gesture.facing',
        'gesture.sequence',
        'gesture.double',
        'mapped.x',
        'mapped.z',
        'mapped.skill.x',
        'mapped.skill.z',
        'mapped.resolvedFrame.body.left',
        'mapped.resolvedFrame.body.forward',
        'mapped.facing',
        'facing',
        'charge',
        ...pathsFor('impulse'),
      ]),
    }));
  const samples: EvidencePoint[] = recording.samples
    .filter((s) => ['simulation', 'pose'].includes(s.channel))
    .map((s) => ({
      kind: 'sample',
      sequence: s.sequence,
      revision: s.revision,
      tick: s.tick,
      simulationTime: s.simulationTime,
      elapsedMs: s.elapsedMs,
      type: s.channel,
      ...(s.slot !== undefined ? { slot: s.slot } : {}),
      values: sampleValues(s.data),
    }));
  const packet: PreparedEvidence = {
    schema: 'suits.motion-evidence',
    schemaVersion: 1,
    recordingSha256: recordingSha256,
    sourceVerification: 'unverified',
    provenance,
    totals: {
      events: recording.events.length,
      samples: recording.samples.length,
      contexts: recording.contexts.length,
    },
    selection: {
      events: 0,
      samples: 0,
      omittedEvents: 0,
      omittedSamples: 0,
      policy: 'bounded-uniform-v1',
    },
    warnings: [
      ...parserWarnings,
      'source-code-not-provided',
      'semantic-analytics-not-run',
      ...(provenance.some((p) => p.dirtyAtServerStart) ? ['dirty-source-at-server-start'] : []),
    ],
    points: [],
  };
  let eventCount = Math.min(events.length, ANALYSIS_LIMITS.evidenceEvents),
    sampleCount = Math.min(samples.length, ANALYSIS_LIMITS.evidenceSamples);
  for (let remaining = eventCount + sampleCount; remaining >= 0; remaining--) {
    packet.points = [...uniform(events, eventCount), ...uniform(samples, sampleCount)].sort(
      (a, b) => a.sequence - b.sequence,
    );
    packet.selection = {
      events: eventCount,
      samples: sampleCount,
      omittedEvents: recording.events.length - eventCount,
      omittedSamples: recording.samples.length - sampleCount,
      policy: 'bounded-uniform-v1',
    };
    if (
      new TextEncoder().encode(JSON.stringify(packet)).byteLength <= ANALYSIS_LIMITS.evidenceBytes
    ) {
      if (packet.selection.omittedEvents || packet.selection.omittedSamples)
        packet.warnings.push('selection-is-incomplete-do-not-infer-command-failure');
      if (
        new TextEncoder().encode(JSON.stringify(packet)).byteLength <= ANALYSIS_LIMITS.evidenceBytes
      )
        return packet;
      packet.warnings.pop();
    }
    if (eventCount === 0 && sampleCount === 0) break;
    if (sampleCount > 0) sampleCount--;
    else eventCount--;
  }
  throw new AnalysisError(
    'evidence_limit',
    422,
    'Recording context cannot fit the bounded evidence packet.',
  );
}
