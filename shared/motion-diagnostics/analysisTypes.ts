import { z } from 'zod';

export const EvidenceReferenceSchema = z
  .object({
    kind: z.enum(['event', 'sample']),
    sequence: z.number().int().positive(),
    revision: z.number().int().min(-1),
  })
  .strict();
const confidence = z.enum(['high', 'medium', 'low', 'unknown']);
export const FindingSchema = z
  .object({
    findingId: z.string().min(1).max(80),
    category: z.enum([
      'input',
      'execution',
      'motion',
      'physics',
      'provenance',
      'recording-quality',
    ]),
    severity: z.enum(['info', 'low', 'medium', 'high']),
    problem: z.string().max(1500),
    expected: z.string().max(1500),
    observed: z.string().max(1500),
    evidence: z.array(EvidenceReferenceSchema).min(1).max(20),
    causeStatus: z.enum(['hypothesis', 'unknown']),
    confidence: z
      .object({ observation: confidence, rootCause: confidence, proposedFix: confidence })
      .strict(),
    recommendation: z
      .object({
        type: z.enum(['investigate', 'test', 'tuning-proposal', 'code-proposal']),
        description: z.string().max(2000),
        target: z.string().max(200).nullable(),
        codeExample: z.string().max(6000).nullable(),
        sourceVerified: z.literal(false),
        requiresDeveloperReview: z.literal(true),
      })
      .strict(),
    risk: z.string().max(1500),
    verification: z.array(z.string().max(700)).max(10),
    status: z.literal('proposed'),
  })
  .strict();
export const AnalysisReportSchema = z
  .object({
    schema: z.literal('suits.motion-analysis'),
    schemaVersion: z.literal(1),
    recordingSha256: z.string().regex(/^[a-f0-9]{64}$/),
    summary: z.string().max(2500),
    sourceVerification: z.literal('unverified'),
    reliability: z
      .object({
        input: z.string().max(1000),
        execution: z.string().max(1000),
        motion: z.string().max(1000),
      })
      .strict(),
    findings: z.array(FindingSchema).max(12),
    limitations: z.array(z.string().max(700)).max(20),
  })
  .strict();
export type AnalysisReport = z.infer<typeof AnalysisReportSchema>;
export interface EvidencePoint {
  sequence: number;
  revision: number;
  tick: number;
  simulationTime: number;
  elapsedMs: number;
  kind: 'event' | 'sample';
  type: string;
  slot?: number;
  commandId?: number;
  action?: string;
  reason?: string;
  values: Record<string, number | boolean | null | string>;
}
export interface PreparedEvidence {
  schema: 'suits.motion-evidence';
  schemaVersion: 1;
  recordingSha256: string;
  sourceVerification: 'unverified';
  provenance: {
    revision: number;
    session: 'duel' | 'training.movement' | 'training.solo' | 'training.one-on-one' | 'unknown';
    characters: ('shaq' | 'chuck')[];
    commit: string | null;
    dirtyAtServerStart: boolean | null;
    codeSha256AtServerStart: string | null;
  }[];
  totals: { events: number; samples: number; contexts: number };
  selection: {
    events: number;
    samples: number;
    omittedEvents: number;
    omittedSamples: number;
    policy: 'bounded-uniform-v1';
  };
  warnings: string[];
  points: EvidencePoint[];
}
