import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { parseRecording } from '../src/services/diagnosticParser.js';
import { buildEvidence } from '../src/services/evidenceBuilder.js';

for (const file of ['defense-recording.json', 'duel-skill-trace.json', 'keyboard-touch.json']) {
  const path = new URL(`../../playtest/diag-1/${file}`, import.meta.url);
  test(
    `local DIAG-1 compatibility fixture: ${file} (not an original user recording)`,
    { skip: !existsSync(path) },
    async () => {
      const parsed = parseRecording(JSON.parse(await readFile(path, 'utf8')));
      const evidence = buildEvidence(parsed.recording, parsed.warnings);
      assert.equal(evidence.sourceVerification, 'unverified');
      assert.ok(Buffer.byteLength(JSON.stringify(evidence)) <= 65536);
      assert.ok(evidence.points.length > 0);
      assert.equal(evidence.totals.events, parsed.recording.events.length);
    },
  );
}
