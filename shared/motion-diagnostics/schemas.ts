import { z } from 'zod';

export const ANALYSIS_LIMITS = {
  requestBytes: 10 * 1024 * 1024,
  events: 20_000,
  samples: 10_000,
  contexts: 128,
  depth: 32,
  nodes: 1_000_000,
  stringLength: 8192,
  evidenceEvents: 120,
  evidenceSamples: 40,
  evidenceBytes: 64 * 1024,
} as const;
const clock = {
  revision: z.number().int().min(-1).max(Number.MAX_SAFE_INTEGER),
  tick: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  simulationTime: z.number().nonnegative().finite(),
  sequence: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  elapsedMs: z.number().nonnegative().finite(),
};
export const DiagnosticEventSchema = z
  .object({
    ...clock,
    type: z
      .string()
      .min(1)
      .max(64)
      .regex(/^[a-z][a-z0-9_.:-]*$/),
    slot: z.number().int().min(0).max(1).optional(),
    commandId: z.number().int().positive().max(Number.MAX_SAFE_INTEGER).optional(),
    action: z.string().max(128).optional(),
    reason: z.string().max(256).optional(),
    data: z.json(),
  })
  .loose();
export const DiagnosticSampleSchema = z
  .object({
    ...clock,
    channel: z.string().min(1).max(64),
    slot: z.number().int().min(0).max(1).optional(),
    data: z.json(),
  })
  .loose();
export const DiagnosticContextSchema = z
  .object({
    revision: clock.revision,
    elapsedMs: clock.elapsedMs,
    metadata: z.json(),
    initialState: z.json(),
  })
  .loose();
export const RecordingSchema = z
  .object({
    schema: z.literal('suits.motion-diagnostics'),
    schemaVersion: z.literal(1),
    mode: z.enum(['capture', 'recent']),
    contexts: z.array(DiagnosticContextSchema).min(1).max(ANALYSIS_LIMITS.contexts),
    events: z.array(DiagnosticEventSchema).max(ANALYSIS_LIMITS.events),
    samples: z.array(DiagnosticSampleSchema).max(ANALYSIS_LIMITS.samples),
    replay: z.object({ supported: z.literal(false) }).loose(),
    externalCommandIds: z.array(clock.sequence).max(ANALYSIS_LIMITS.events).optional(),
    droppedEvents: z.number().int().nonnegative().optional(),
    droppedSamples: z.number().int().nonnegative().optional(),
  })
  .loose();
export const PrepareRequestSchema = z.object({ recording: RecordingSchema }).strict();
export type DiagnosticRecording = z.infer<typeof RecordingSchema>;
export type DiagnosticEvent = z.infer<typeof DiagnosticEventSchema>;
export type DiagnosticSample = z.infer<typeof DiagnosticSampleSchema>;
