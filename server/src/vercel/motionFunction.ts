import { createHash, timingSafeEqual } from 'node:crypto';
import { AnalysisError, COMPACT_REQUEST_BYTES, parseCompactRequest } from '@suits/motion-contracts';

function json(value: unknown, status = 200, headers: Record<string, string> = {}) {
  return Response.json(value, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...headers,
    },
  });
}
async function readJson(request: Request): Promise<unknown> {
  if (
    !/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers.get('content-type') ?? '')
  )
    throw new AnalysisError(
      'unsupported_content_type',
      415,
      'Send application/json with UTF-8 encoding.',
    );
  if (!['identity', null].includes(request.headers.get('content-encoding')))
    throw new AnalysisError('unsupported_encoding', 415, 'Send uncompressed JSON.');
  const length = request.headers.get('content-length');
  if (length && (!/^\d+$/.test(length) || Number(length) > COMPACT_REQUEST_BYTES))
    throw new AnalysisError('request_too_large', 413, 'Compact request exceeds 96 KiB.');
  const reader = request.body?.getReader();
  if (!reader) throw new AnalysisError('invalid_json', 400, 'Request body must be valid JSON.');
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > COMPACT_REQUEST_BYTES) {
        void reader.cancel().catch(() => {});
        throw new AnalysisError('request_too_large', 413, 'Compact request exceeds 96 KiB.');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const buffer = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) {
    buffer.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(buffer));
  } catch {
    throw new AnalysisError('invalid_json', 400, 'Request body must be valid UTF-8 JSON.');
  }
}

/** In-memory admission is best effort per warm instance, never a distributed cost budget. */
export function createMotionFunction(
  environment: () => NodeJS.ProcessEnv = () => process.env,
  now: () => number = Date.now,
) {
  let started = 0,
    count = 0,
    active = 0;
  return async (request: Request): Promise<Response> => {
    let admitted = false;
    try {
      if (request.method !== 'POST')
        return json({ error: { code: 'method_not_allowed' } }, 405, { Allow: 'POST' });
      const token = environment().MOTION_ANALYSIS_TOKEN;
      if (!token || token.trim().length < 32 || token.length > 256)
        throw new AnalysisError(
          'access_not_configured',
          503,
          'Developer API access is not configured.',
        );
      if (request.headers.has('origin'))
        throw new AnalysisError(
          'browser_access_disabled',
          403,
          'Use an authenticated developer API client.',
        );
      const auth = request.headers.get('authorization') ?? '';
      if (
        !auth.startsWith('Bearer ') ||
        auth.length > 263 ||
        !timingSafeEqual(
          createHash('sha256').update(auth.slice(7)).digest(),
          createHash('sha256').update(token).digest(),
        )
      )
        throw new AnalysisError('unauthorized', 401, 'Developer authentication is required.');
      const time = now();
      if (time - started >= 60_000) {
        started = time;
        count = 0;
      }
      if (++count > 20 || active >= 2)
        return json(
          { error: { code: 'rate_limited', message: 'Developer request limit reached.' } },
          429,
          { 'Retry-After': '60' },
        );
      active++;
      admitted = true;
      const evidence = parseCompactRequest(await readJson(request));
      return json({
        schema: 'suits.motion-preparation',
        schemaVersion: 1,
        status: 'prepared',
        aiCalled: false,
        analysisStatus: 'not-implemented',
        originalRecordingVerified: false,
        evidence,
      });
    } catch (error) {
      if (error instanceof AnalysisError)
        return json({ error: { code: error.code, message: error.message } }, error.status);
      // Log only a fixed code; never request bodies, tokens, recordings or provider responses.
      console.error('motion_function_internal_error');
      return json(
        { error: { code: 'internal_error', message: 'Unable to prepare evidence.' } },
        500,
      );
    } finally {
      if (admitted) active--;
    }
  };
}
