import { z } from 'zod';
import { ANALYSIS_LIMITS } from './schemas.js';
import type { PreparedEvidence } from './analysisTypes.js';
import {
  EVIDENCE_ACTIONS,
  EVIDENCE_REASONS,
  EVIDENCE_STATES,
  EVIDENCE_TYPES,
} from './projectEvidence.js';
import { checkJsonBudget } from './validateCapture.js';
import { AnalysisError } from './errors.js';

export const COMPACT_REQUEST_BYTES = 96 * 1024;
const integer = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const revision = z.number().int().min(-1).max(Number.MAX_SAFE_INTEGER);
const hex = (length: number) => z.string().regex(new RegExp(`^[a-f0-9]{${length}}$`));
const known = (set: Set<string>) =>
  z
    .string()
    .max(128)
    .refine((v) => set.has(v));
const warnings = z.enum([
  'simulation-clock-regression',
  'monotonic-clock-regression',
  'recording-window-truncated',
  'commands-started-outside-window',
  'source-code-not-provided',
  'semantic-analytics-not-run',
  'dirty-source-at-server-start',
  'selection-is-incomplete-do-not-infer-command-failure',
]);
export const PreparedEvidenceSchema = z
  .object({
    schema: z.literal('suits.motion-evidence'),
    schemaVersion: z.literal(1),
    recordingSha256: hex(64),
    sourceVerification: z.literal('unverified'),
    provenance: z
      .array(
        z
          .object({
            revision,
            session: z.enum([
              'duel',
              'training.movement',
              'training.solo',
              'training.one-on-one',
              'unknown',
            ]),
            characters: z.array(z.enum(['shaq', 'chuck'])).max(2),
            commit: hex(40).nullable(),
            dirtyAtServerStart: z.boolean().nullable(),
            codeSha256AtServerStart: hex(64).nullable(),
          })
          .strict(),
      )
      .min(1)
      .max(ANALYSIS_LIMITS.contexts),
    totals: z
      .object({
        events: integer.max(ANALYSIS_LIMITS.events),
        samples: integer.max(ANALYSIS_LIMITS.samples),
        contexts: integer.max(ANALYSIS_LIMITS.contexts),
      })
      .strict(),
    selection: z
      .object({
        events: integer.max(ANALYSIS_LIMITS.evidenceEvents),
        samples: integer.max(ANALYSIS_LIMITS.evidenceSamples),
        omittedEvents: integer.max(ANALYSIS_LIMITS.events),
        omittedSamples: integer.max(ANALYSIS_LIMITS.samples),
        policy: z.literal('bounded-uniform-v1'),
      })
      .strict(),
    warnings: z.array(warnings).max(20),
    points: z
      .array(
        z
          .object({
            kind: z.enum(['event', 'sample']),
            sequence: integer.min(1),
            revision,
            tick: integer,
            simulationTime: z.number().nonnegative().finite(),
            elapsedMs: z.number().nonnegative().finite(),
            type: z
              .string()
              .max(64)
              .refine((v) => EVIDENCE_TYPES.has(v) || ['simulation', 'pose'].includes(v)),
            slot: z.number().int().min(0).max(1).optional(),
            commandId: integer.min(1).optional(),
            action: known(EVIDENCE_ACTIONS).optional(),
            reason: known(EVIDENCE_REASONS).optional(),
            values: z.record(
              z
                .string()
                .max(128)
                .regex(/^[a-zA-Z0-9_.-]+$/),
              z.union([z.number().finite(), z.boolean(), z.null(), known(EVIDENCE_STATES)]),
            ),
          })
          .strict(),
      )
      .max(ANALYSIS_LIMITS.evidenceEvents + ANALYSIS_LIMITS.evidenceSamples),
  })
  .strict();
export const CompactRequestSchema = z.object({ evidence: PreparedEvidenceSchema }).strict();

/** Validate client assertions; an original recording/hash cannot be attested from this packet. */
export function parseCompactRequest(value: unknown): PreparedEvidence {
  checkJsonBudget(value);
  const result = CompactRequestSchema.safeParse(value);
  if (!result.success)
    throw new AnalysisError('invalid_evidence', 422, 'Invalid compact evidence package.');
  const e = result.data.evidence;
  if (new TextEncoder().encode(JSON.stringify(e)).byteLength > ANALYSIS_LIMITS.evidenceBytes)
    throw new AnalysisError('evidence_too_large', 413, 'Evidence exceeds 64 KiB.');
  const contexts = new Set(e.provenance.map((p) => p.revision));
  let previous = 0,
    events = 0,
    samples = 0;
  for (const p of e.points) {
    if (
      p.sequence <= previous ||
      (p.revision !== -1 && !contexts.has(p.revision)) ||
      (p.kind === 'event' ? !EVIDENCE_TYPES.has(p.type) : !['simulation', 'pose'].includes(p.type))
    )
      throw new AnalysisError('invalid_evidence', 422, 'Invalid evidence order, type or context.');
    previous = p.sequence;
    if (p.kind === 'event') events++;
    else samples++;
  }
  if (
    contexts.size !== e.provenance.length ||
    e.totals.contexts !== contexts.size ||
    events !== e.selection.events ||
    samples !== e.selection.samples ||
    events + e.selection.omittedEvents !== e.totals.events ||
    samples + e.selection.omittedSamples !== e.totals.samples
  )
    throw new AnalysisError('invalid_evidence', 422, 'Inconsistent evidence selection counts.');
  const caveats = new Set(e.warnings);
  caveats.add('source-code-not-provided');
  caveats.add('semantic-analytics-not-run');
  if (e.selection.omittedEvents || e.selection.omittedSamples)
    caveats.add('selection-is-incomplete-do-not-infer-command-failure');
  if (e.provenance.some((p) => p.dirtyAtServerStart)) caveats.add('dirty-source-at-server-start');
  const normalized = { ...e, warnings: [...caveats] };
  if (
    new TextEncoder().encode(JSON.stringify(normalized)).byteLength > ANALYSIS_LIMITS.evidenceBytes
  )
    throw new AnalysisError('evidence_too_large', 413, 'Evidence exceeds 64 KiB after validation.');
  return normalized;
}
