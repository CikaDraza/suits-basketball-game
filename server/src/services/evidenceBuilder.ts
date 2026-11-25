import { createHash } from 'node:crypto';
import { projectEvidence, type DiagnosticRecording } from '@suits/motion-contracts';

export function buildEvidence(recording: DiagnosticRecording, parserWarnings: string[]) {
  const hash = createHash('sha256').update(JSON.stringify(recording)).digest('hex');
  return projectEvidence(recording, parserWarnings, hash);
}
