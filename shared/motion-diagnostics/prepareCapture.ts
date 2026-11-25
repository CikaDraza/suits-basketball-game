import { ANALYSIS_LIMITS } from './schemas.js';
import { parseRecording } from './validateCapture.js';
import { projectEvidence } from './projectEvidence.js';
import { AnalysisError } from './errors.js';

/** Browser-safe preparation only. Never uploads or accesses provider credentials. */
export async function prepareCapture(value: unknown) {
  const { recording, warnings } = parseRecording(value);
  const bytes = new TextEncoder().encode(JSON.stringify(recording));
  if (bytes.byteLength > ANALYSIS_LIMITS.requestBytes)
    throw new AnalysisError('recording_too_large', 413, 'Local recording exceeds 10 MiB.');
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  const hash = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
  return projectEvidence(recording, warnings, hash);
}
