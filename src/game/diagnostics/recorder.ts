import { gameplayCommands } from './gameplayCommands';

/** UI-independent, bounded, local-only diagnostic storage. Never drives gameplay. */
export interface DiagnosticClock {
  revision: number;
  tick: number;
  simulationTime: number;
}
export interface DiagnosticEvent extends DiagnosticClock {
  sequence: number;
  elapsedMs: number;
  type: string;
  slot?: number;
  commandId?: number;
  action?: string;
  reason?: string;
  data: unknown;
}
export interface DiagnosticSample extends DiagnosticClock {
  sequence: number;
  elapsedMs: number;
  channel: string;
  slot?: number;
  data: unknown;
}
export interface DiagnosticContext {
  revision: number;
  elapsedMs: number;
  metadata: unknown;
  initialState: unknown;
}
interface Buffer {
  events: DiagnosticEvent[];
  samples: DiagnosticSample[];
  droppedEvents: number;
  droppedSamples: number;
}
const buffer = (): Buffer => ({ events: [], samples: [], droppedEvents: 0, droppedSamples: 0 });
export const DIAGNOSTIC_LIMITS = {
  recentSeconds: 30,
  recordingSeconds: 60,
  maxEvents: 6000,
  maxSamples: 2400,
  maxContexts: 64,
  sampleHz: 10,
} as const;

export function createMotionRecorder(
  options: {
    enabled?: boolean;
    now?: () => number;
    limits?: Partial<Record<keyof typeof DIAGNOSTIC_LIMITS, number>>;
    onEvent?: (event: DiagnosticEvent) => void;
  } = {},
) {
  const enabled = options.enabled ?? true;
  const now = options.now ?? (() => performance.now());
  const limits = { ...DIAGNOSTIC_LIMITS, ...options.limits };
  const origin = now();
  let clock: () => DiagnosticClock = () => ({ revision: -1, tick: 0, simulationTime: 0 });
  let sequence = 0;
  let checkpoint: (() => unknown) | null = null;
  const recent = buffer();
  let capture: Buffer | null = null;
  let captureContexts: DiagnosticContext[] = [];
  let state: 'rolling' | 'recording' | 'stopped' = 'rolling';
  let startedAt = 0;
  let stoppedAt: number | null = null;
  let stopReason: string | null = null;
  const contexts: DiagnosticContext[] = [];
  const stamp = () => ({ ...clock(), sequence: ++sequence, elapsedMs: now() - origin });
  const trim = (target: Buffer, rolling: boolean) => {
    const cutoff = rolling ? now() - origin - limits.recentSeconds * 1000 : -Infinity;
    while (
      target.events.length &&
      (target.events[0].elapsedMs < cutoff || target.events.length > limits.maxEvents)
    ) {
      target.events.shift();
      target.droppedEvents++;
    }
    while (
      target.samples.length &&
      (target.samples[0].elapsedMs < cutoff || target.samples.length > limits.maxSamples)
    ) {
      target.samples.shift();
      target.droppedSamples++;
    }
  };
  const stop = (reason = 'user') => {
    if (state !== 'recording') return;
    state = 'stopped';
    stoppedAt = now() - origin;
    stopReason = reason;
  };
  const append = <T extends DiagnosticEvent | DiagnosticSample>(
    key: 'events' | 'samples',
    item: T,
  ) => {
    // Payloads must be immutable even when the engine reuses vectors and arrays.
    const copy = structuredClone(item);
    (recent[key] as T[]).push(copy);
    trim(recent, true);
    if (state !== 'recording' || !capture) return;
    if (item.elapsedMs - startedAt >= limits.recordingSeconds * 1000) {
      stop('duration-limit');
      return;
    }
    (capture[key] as T[]).push(copy);
    if (capture.events.length >= limits.maxEvents || capture.samples.length >= limits.maxSamples)
      stop('capacity-limit');
  };
  const event = (
    type: string,
    data: unknown = {},
    fields: Partial<Pick<DiagnosticEvent, 'slot' | 'commandId' | 'action' | 'reason'>> = {},
  ) => {
    if (!enabled) return 0;
    const item: DiagnosticEvent = { ...stamp(), type, ...fields, data };
    append('events', item);
    options.onEvent?.(structuredClone(item));
    return item.sequence;
  };
  return {
    enabled,
    limits,
    setClock: (reader: typeof clock) => {
      clock = reader;
    },
    setCheckpoint: (reader: () => unknown) => {
      checkpoint = reader;
    },
    context(metadata: unknown, initialState: unknown) {
      if (!enabled) return;
      contexts.push({
        revision: clock().revision,
        elapsedMs: now() - origin,
        metadata: structuredClone(metadata),
        initialState: structuredClone(initialState),
      });
      if (state === 'recording') {
        if (captureContexts.length >= limits.maxContexts) stop('context-limit');
        else captureContexts.push(structuredClone(contexts[contexts.length - 1]));
      }
      if (contexts.length > limits.maxContexts) {
        contexts.shift();
        const oldest = contexts[0].elapsedMs;
        for (const target of [recent])
          if (target) {
            while (target.events[0]?.elapsedMs < oldest) {
              target.events.shift();
              target.droppedEvents++;
            }
            while (target.samples[0]?.elapsedMs < oldest) {
              target.samples.shift();
              target.droppedSamples++;
            }
          }
      }
      event('session.begin', { revision: clock().revision });
    },
    event,
    sample(channel: string, data: unknown, slot?: number) {
      if (enabled) append('samples', { ...stamp(), channel, slot, data });
    },
    start() {
      if (!enabled) return;
      capture = buffer();
      captureContexts = structuredClone(contexts.slice(-1));
      state = 'recording';
      startedAt = now() - origin;
      stoppedAt = null;
      stopReason = null;
      event('recording.started');
      if (checkpoint) append('samples', { ...stamp(), channel: 'checkpoint', data: checkpoint() });
    },
    stop() {
      if (state === 'recording') {
        event('recording.stopped');
        stop();
      }
    },
    status() {
      if (state === 'recording' && now() - origin - startedAt >= limits.recordingSeconds * 1000)
        stop('duration-limit');
      trim(recent, true);
      const selected = capture ?? recent;
      return {
        enabled,
        state,
        startedAt,
        stoppedAt,
        stopReason,
        events: selected.events.length,
        samples: selected.samples.length,
        recentEvents: recent.events.length,
        recentSamples: recent.samples.length,
      };
    },
    timeline(slot: number, limit = 20) {
      trim(recent, true);
      return structuredClone(
        recent.events.filter((e) => e.slot === undefined || e.slot === slot).slice(-limit),
      );
    },
    export(recentOnly = false) {
      trim(recent, true);
      if (state === 'recording' && now() - origin - startedAt >= limits.recordingSeconds * 1000)
        stop('duration-limit');
      const selected = recentOnly ? recent : (capture ?? recent);
      const revisions = new Set([...selected.events, ...selected.samples].map((e) => e.revision));
      if (revisions.size === 0) revisions.add(clock().revision);
      const retainedIds = new Set(selected.events.map((e) => e.sequence));
      // JSON has no Infinity/NaN. A null is explicitly an unavailable/unbounded value.
      return JSON.parse(
        JSON.stringify(
          {
            externalCommandIds: [
              ...new Set(
                selected.events.flatMap((e) =>
                  e.commandId && !retainedIds.has(e.commandId) ? [e.commandId] : [],
                ),
              ),
            ],
            schema: 'suits.motion-diagnostics',
            schemaVersion: 1,
            exportedAt: new Date().toISOString(),
            mode: recentOnly || !capture ? 'recent' : 'capture',
            state,
            limits,
            stopReason,
            startedAt: recentOnly || !capture ? null : startedAt,
            stoppedAt: recentOnly || !capture ? null : stoppedAt,
            timebase: {
              elapsedMs: 'monotonic wall time since diagnostics boot',
              simulationTime: 'seconds within revision',
              tick: 'fixed simulation step within revision; input/pose may occur between steps',
              order: 'sequence is total ordering across revisions',
              nonFinite: 'null means unavailable or unbounded',
            },
            replay: {
              supported: false,
              note: 'Diagnostic trace with checkpoints, not a deterministic cross-browser replay.',
            },
            contexts: (recentOnly || !capture ? contexts : captureContexts).filter((c) =>
              revisions.has(c.revision),
            ),
            ...selected,
          },
          (_key, value: unknown) =>
            typeof value === 'number' && !Number.isFinite(value) ? null : value,
        ),
      ) as {
        schema: string;
        schemaVersion: number;
        mode: string;
        contexts: DiagnosticContext[];
        events: DiagnosticEvent[];
        samples: DiagnosticSample[];
        droppedEvents: number;
        droppedSamples: number;
      };
    },
  };
}
export const motionRecorder = /* @__PURE__ */ createMotionRecorder({
  enabled: import.meta.env?.DEV === true,
  onEvent: import.meta.env?.DEV ? gameplayCommands.observe : undefined,
});
