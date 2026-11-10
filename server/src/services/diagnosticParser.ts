import {
  ANALYSIS_LIMITS,
  RecordingSchema,
  type DiagnosticRecording,
} from '@suits/motion-contracts';
import { AnalysisError } from './errors.js';

/** Check before recursive schema validation; all client payloads remain inert JSON. */
export function checkJsonBudget(value: unknown): void {
  const stack: { value: unknown; depth: number }[] = [{ value, depth: 0 }];
  let nodes = 0;
  while (stack.length) {
    const item = stack.pop()!;
    if (++nodes > ANALYSIS_LIMITS.nodes || item.depth > ANALYSIS_LIMITS.depth)
      throw new AnalysisError('recording_complexity', 422, 'Recording exceeds structural limits.');
    if (typeof item.value === 'number' && !Number.isFinite(item.value))
      throw new AnalysisError('invalid_recording', 422, 'Recording contains a nonfinite number.');
    if (typeof item.value === 'string' && item.value.length > ANALYSIS_LIMITS.stringLength)
      throw new AnalysisError(
        'recording_complexity',
        422,
        'Recording contains an oversized string.',
      );
    if (item.value && typeof item.value === 'object') {
      if (
        (Array.isArray(item.value) && item.value.length > ANALYSIS_LIMITS.events) ||
        (!Array.isArray(item.value) && Object.keys(item.value).length > 4096)
      )
        throw new AnalysisError(
          'recording_complexity',
          422,
          'Recording contains an oversized collection.',
        );
      for (const [key, child] of Object.entries(item.value)) {
        if (key.length > 256)
          throw new AnalysisError(
            'recording_complexity',
            422,
            'Recording contains an oversized key.',
          );
        if (['__proto__', 'constructor', 'prototype'].includes(key))
          throw new AnalysisError(
            'invalid_recording',
            422,
            'Recording contains an unsupported object key.',
          );
        stack.push({ value: child, depth: item.depth + 1 });
      }
    } else if (
      typeof item.value === 'function' ||
      typeof item.value === 'bigint' ||
      typeof item.value === 'symbol' ||
      item.value === undefined
    ) {
      throw new AnalysisError('invalid_recording', 422, 'Recording must contain JSON values only.');
    }
  }
}
export function parseRecording(value: unknown): {
  recording: DiagnosticRecording;
  warnings: string[];
} {
  checkJsonBudget(value);
  const parsed = RecordingSchema.safeParse(value);
  if (!parsed.success)
    throw new AnalysisError(
      'invalid_recording',
      422,
      'Unsupported or invalid motion diagnostic recording.',
    );
  const recording = parsed.data;
  const contexts = new Set<number>();
  for (const context of recording.contexts) {
    if (contexts.has(context.revision))
      throw new AnalysisError(
        'invalid_recording',
        422,
        'Recording contains duplicate context revisions.',
      );
    contexts.add(context.revision);
  }
  const sequences = new Set<number>();
  for (const list of [recording.events, recording.samples]) {
    let previous = 0;
    for (const point of list) {
      if (sequences.has(point.sequence) || point.sequence <= previous)
        throw new AnalysisError(
          'invalid_recording',
          422,
          'Recording sequences must be unique and ordered within each stream.',
        );
      sequences.add(point.sequence);
      previous = point.sequence;
      if (point.revision !== -1 && !contexts.has(point.revision))
        throw new AnalysisError(
          'invalid_recording',
          422,
          'Recording refers to a missing session context.',
        );
    }
  }
  const warnings = new Set<string>();
  const clocks = new Map<number, { tick: number; time: number }>();
  let elapsed = -1;
  for (const point of [...recording.events, ...recording.samples].sort(
    (a, b) => a.sequence - b.sequence,
  )) {
    const old = clocks.get(point.revision);
    if (old && (point.tick < old.tick || point.simulationTime < old.time))
      warnings.add('simulation-clock-regression');
    if (point.elapsedMs < elapsed) warnings.add('monotonic-clock-regression');
    clocks.set(point.revision, { tick: point.tick, time: point.simulationTime });
    elapsed = point.elapsedMs;
  }
  if ((recording.droppedEvents ?? 0) > 0 || (recording.droppedSamples ?? 0) > 0)
    warnings.add('recording-window-truncated');
  const requested = new Set(
    recording.events.filter((e) => e.type === 'command.requested').map((e) => e.sequence),
  );
  if (recording.events.some((e) => e.commandId && !requested.has(e.commandId)))
    warnings.add('commands-started-outside-window');
  return { recording, warnings: [...warnings] };
}
