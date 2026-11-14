import { Router } from 'express';
import { buildEvidence } from '../services/evidenceBuilder.js';
import { parseRecording } from '../services/diagnosticParser.js';
import { AnalysisError } from '../services/errors.js';

export function motionAnalysisRoutes() {
  const router = Router();
  router.post('/prepare', (req, res) => {
    const body: unknown = req.body;
    if (
      !body ||
      typeof body !== 'object' ||
      Array.isArray(body) ||
      Object.keys(body).some((key) => key !== 'recording') ||
      !('recording' in body)
    )
      throw new AnalysisError('invalid_request', 422, 'Expected a recording envelope.');
    const { recording, warnings } = parseRecording(body.recording);
    const evidence = buildEvidence(recording, warnings);
    res.json({ schema: 'suits.motion-preparation', schemaVersion: 1, aiCalled: false, evidence });
  });
  return router;
}
