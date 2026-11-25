import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createOpenAIMotionAgent,
  readProviderConfig,
  validateReport,
} from '../src/services/openaiMotionAgent.js';
import { AnalysisError } from '../src/services/errors.js';
import { prepared, report } from './fixtures.js';

const config = {
  apiKey: 'test-only-secret-key',
  model: 'test-structured-model',
  maxOutputTokens: 2048,
};
function response(output: unknown, extra = {}) {
  return new Response(
    JSON.stringify({
      id: 'resp_test',
      object: 'response',
      status: 'completed',
      output: [
        {
          id: 'msg_test',
          type: 'message',
          role: 'assistant',
          status: 'completed',
          content: [{ type: 'output_text', text: JSON.stringify(output), annotations: [] }],
        },
      ],
      ...extra,
    }),
    { headers: { 'Content-Type': 'application/json' } },
  );
}
const failure = (code: string) => (e: unknown) =>
  e instanceof AnalysisError && e.code === code && !e.message.includes(config.apiKey);

test('provider configuration is explicit; missing key/model cannot trigger a provider call', () => {
  assert.throws(() => readProviderConfig({}), failure('provider_not_configured'));
  assert.throws(
    () => readProviderConfig({ OPENAI_API_KEY: config.apiKey }),
    failure('provider_not_configured'),
  );
});
test('official SDK uses Responses Structured Outputs, no tools/storage/retries, and sends only bounded evidence', async () => {
  let count = 0;
  const transport: typeof fetch = async (url, init) => {
    count++;
    assert.equal(String(url), 'https://api.openai.com/v1/responses');
    const body = JSON.parse(String(init!.body));
    assert.equal(body.store, false);
    assert.deepEqual(body.tools, []);
    assert.equal(body.tool_choice, 'none');
    assert.equal(body.text.format.type, 'json_schema');
    assert.equal(body.text.format.strict, true);
    assert.equal(body.max_output_tokens, 2048);
    assert.equal(body.model, config.model);
    assert.ok(!body.input.includes('PRIVATE_'));
    assert.ok(!body.input.includes(config.apiKey));
    assert.ok(body.instructions.includes('untrusted data'));
    return response(report());
  };
  const result = await createOpenAIMotionAgent(config, transport).analyzeEvidence(prepared());
  assert.deepEqual(result.findings, []);
  assert.equal(count, 1);
});
test('provider refusal and incomplete output are distinct sanitized failures', async () => {
  const refusal: typeof fetch = async () =>
    response(null, {
      output: [
        { type: 'message', role: 'assistant', content: [{ type: 'refusal', refusal: 'Declined' }] },
      ],
    });
  await assert.rejects(
    createOpenAIMotionAgent(config, refusal).analyzeEvidence(prepared()),
    failure('provider_refused'),
  );
  await assert.rejects(
    createOpenAIMotionAgent(config, async () =>
      response(null, { status: 'incomplete', output: [] }),
    ).analyzeEvidence(prepared()),
    failure('provider_incomplete'),
  );
});
test('invalid structured output and nonexistent evidence IDs fail closed', async () => {
  await assert.rejects(
    createOpenAIMotionAgent(config, async () => response({ notAReport: true })).analyzeEvidence(
      prepared(),
    ),
    failure('provider_invalid_output'),
  );
  assert.throws(
    () => validateReport({ ...report(), recordingSha256: '0'.repeat(64) }, prepared()),
    failure('provider_invalid_output'),
  );
  const result = report();
  result.findings.push({
    findingId: 'test',
    category: 'motion',
    severity: 'low',
    problem: 'Hypothesis',
    expected: 'Unknown',
    observed: 'Unknown',
    evidence: [{ kind: 'event', sequence: 9999, revision: 1 }],
    causeStatus: 'unknown',
    confidence: { observation: 'low', rootCause: 'unknown', proposedFix: 'unknown' },
    recommendation: {
      type: 'investigate',
      description: 'Inspect',
      target: null,
      codeExample: null,
      sourceVerified: false,
      requiresDeveloperReview: true,
    },
    risk: 'Insufficient evidence',
    verification: ['Collect evidence'],
    status: 'proposed',
  });
  assert.throws(() => validateReport(result, prepared()), failure('provider_invalid_evidence'));
  result.findings[0].evidence[0].sequence = 1;
  result.findings[0].recommendation.type = 'code-proposal';
  result.findings[0].confidence.rootCause = 'high';
  assert.throws(() => validateReport(result, prepared()), failure('provider_unverified_cause'));
  result.findings[0].confidence.rootCause = 'unknown';
  assert.equal(
    validateReport(result, prepared()).findings[0].recommendation.requiresDeveloperReview,
    true,
  );
});
test('authentication failures are not retried and provider response text/secrets are never returned', async () => {
  let count = 0;
  const transport: typeof fetch = async () => {
    count++;
    return new Response(
      JSON.stringify({ error: { message: config.apiKey, type: 'authentication_error' } }),
      { status: 401, headers: { 'Content-Type': 'application/json' } },
    );
  };
  await assert.rejects(
    createOpenAIMotionAgent(config, transport).analyzeEvidence(prepared()),
    failure('provider_authentication_failed'),
  );
  assert.equal(count, 1);
});
test('readiness check sends a fixed small prompt and no recording or repository instructions', async () => {
  let requests = 0;
  const transport: typeof fetch = async (_url, init) => {
    requests++;
    const body = JSON.parse(String(init!.body));
    assert.ok(body.input.includes('No recording is attached'));
    assert.ok(!body.input.includes('suits.motion-evidence'));
    assert.equal(body.store, false);
    return response({ status: 'ok' });
  };
  assert.deepEqual(await createOpenAIMotionAgent(config, transport).checkConnection(), {
    status: 'ok',
  });
  assert.equal(requests, 1);
});
