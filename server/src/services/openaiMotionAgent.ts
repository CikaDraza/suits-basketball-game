import OpenAI from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';
import { z } from 'zod';
import {
  ANALYSIS_LIMITS,
  AnalysisReportSchema,
  type PreparedEvidence,
  type AnalysisReport,
} from '@suits/motion-contracts';
import { AnalysisError } from './errors.js';
import { MOTION_ANALYST_INSTRUCTIONS } from '../prompts/motionAnalyst.js';

const ProviderSchema = z.object({
  OPENAI_API_KEY: z.string().trim().min(1),
  OPENAI_MODEL: z
    .string()
    .min(1)
    .max(120)
    .regex(/^[a-z0-9][a-z0-9._:-]*$/i),
  OPENAI_MAX_OUTPUT_TOKENS: z.coerce.number().int().min(128).max(4096).default(2048),
});
export function readProviderConfig(env: NodeJS.ProcessEnv = process.env) {
  const result = ProviderSchema.safeParse(env);
  if (!result.success)
    throw new AnalysisError(
      'provider_not_configured',
      503,
      'Set server-only OPENAI_API_KEY and OPENAI_MODEL before requesting provider access.',
    );
  return {
    apiKey: result.data.OPENAI_API_KEY,
    model: result.data.OPENAI_MODEL,
    maxOutputTokens: result.data.OPENAI_MAX_OUTPUT_TOKENS,
  };
}
function providerError(error: unknown): AnalysisError {
  if (error instanceof AnalysisError) return error;
  if (error instanceof z.ZodError || error instanceof SyntaxError)
    return new AnalysisError(
      'provider_invalid_output',
      502,
      'Provider output did not match the report contract.',
    );
  if (error instanceof OpenAI.APIConnectionTimeoutError)
    return new AnalysisError('provider_timeout', 504, 'Provider request timed out.');
  if (error instanceof OpenAI.APIError && (error.status === 401 || error.status === 403))
    return new AnalysisError(
      'provider_authentication_failed',
      503,
      'Provider credentials could not be used.',
    );
  if (error instanceof OpenAI.APIError && error.status === 429)
    return new AnalysisError('provider_rate_limited', 429, 'Provider request limit reached.');
  return new AnalysisError('provider_unavailable', 502, 'Provider request could not complete.');
}
export function validateReport(value: unknown, evidence: PreparedEvidence): AnalysisReport {
  const parsed = AnalysisReportSchema.safeParse(value);
  if (!parsed.success || parsed.data.recordingSha256 !== evidence.recordingSha256)
    throw new AnalysisError(
      'provider_invalid_output',
      502,
      'Provider output did not match this recording.',
    );
  const references = new Set(evidence.points.map((p) => `${p.kind}:${p.sequence}:${p.revision}`));
  const ids = new Set<string>();
  for (const finding of parsed.data.findings) {
    if (
      ids.has(finding.findingId) ||
      finding.evidence.some((e) => !references.has(`${e.kind}:${e.sequence}:${e.revision}`))
    )
      throw new AnalysisError(
        'provider_invalid_evidence',
        502,
        'Provider output referenced unavailable evidence.',
      );
    ids.add(finding.findingId);
    if (finding.recommendation.type === 'code-proposal' && finding.confidence.rootCause === 'high')
      throw new AnalysisError(
        'provider_unverified_cause',
        502,
        'Code proposals cannot claim a high-confidence cause without source evidence.',
      );
  }
  return parsed.data;
}

/** Server-only transport foundation. 1A deliberately does not expose this as an HTTP analysis route. */
export function createOpenAIMotionAgent(
  config: ReturnType<typeof readProviderConfig>,
  transport?: typeof fetch,
) {
  const client = new OpenAI({
    apiKey: config.apiKey,
    baseURL: 'https://api.openai.com/v1',
    maxRetries: 0,
    logLevel: 'off',
    timeout: 20_000,
    ...(transport ? { fetch: transport } : {}),
  });
  return {
    async analyzeEvidence(evidence: PreparedEvidence): Promise<AnalysisReport> {
      const input = JSON.stringify(evidence);
      if (
        Buffer.byteLength(input) > ANALYSIS_LIMITS.evidenceBytes ||
        evidence.schema !== 'suits.motion-evidence' ||
        evidence.sourceVerification !== 'unverified'
      )
        throw new AnalysisError(
          'invalid_evidence',
          422,
          'Provider requires a bounded prepared evidence packet.',
        );
      try {
        const response = await client.responses.parse({
          model: config.model,
          instructions: MOTION_ANALYST_INSTRUCTIONS,
          input,
          store: false,
          max_output_tokens: config.maxOutputTokens,
          tools: [],
          tool_choice: 'none',
          text: { format: zodTextFormat(AnalysisReportSchema, 'suits_motion_report') },
        });
        if (response.status !== 'completed')
          throw new AnalysisError(
            'provider_incomplete',
            502,
            'Provider did not complete the report.',
          );
        if (
          response.output.some(
            (item) => item.type === 'message' && item.content.some((c) => c.type === 'refusal'),
          )
        )
          throw new AnalysisError(
            'provider_refused',
            422,
            'Provider declined this analysis request.',
          );
        return validateReport(response.output_parsed, evidence);
      } catch (error) {
        throw providerError(error);
      }
    },
    async checkConnection(): Promise<{ status: 'ok' }> {
      try {
        const response = await client.responses.parse({
          model: config.model,
          input: 'Return status ok for a SUITS API connectivity check. No recording is attached.',
          store: false,
          max_output_tokens: config.maxOutputTokens,
          tools: [],
          tool_choice: 'none',
          text: {
            format: zodTextFormat(
              z.object({ status: z.literal('ok') }).strict(),
              'suits_provider_check',
            ),
          },
        });
        if (response.status !== 'completed' || response.output_parsed?.status !== 'ok')
          throw new AnalysisError('provider_incomplete', 502, 'Provider check did not complete.');
        return { status: 'ok' };
      } catch (error) {
        throw providerError(error);
      }
    },
  };
}
