import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { ANALYSIS_LIMITS } from '@suits/motion-contracts';
import { readConfig } from './config.js';

// Explicit developer CLI, not an agent tool or an HTTP file-access endpoint.
try {
  const file = process.argv[2];
  if (!file) throw new Error('missing-path');
  const path = resolve(process.env.INIT_CWD ?? process.cwd(), file);
  if ((await stat(path)).size > ANALYSIS_LIMITS.requestBytes) throw new Error('file-limit');
  const recording: unknown = JSON.parse(await readFile(path, 'utf8'));
  const body = JSON.stringify({ recording });
  if (Buffer.byteLength(body) > ANALYSIS_LIMITS.requestBytes) throw new Error('file-limit');
  const config = readConfig();
  const response = await fetch(`http://127.0.0.1:${config.port}/api/motion-analysis/prepare`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.accessToken}` },
    body,
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    console.error(
      JSON.stringify({
        status: response.status,
        message:
          'Recording preparation failed. Check the recording and developer API configuration.',
      }),
    );
    process.exitCode = 1;
  } else console.log(JSON.stringify(await response.json(), null, 2));
} catch {
  console.error(
    'Unable to prepare recording. Pass a valid local JSON file up to 10 MiB and start the configured analysis API first.',
  );
  process.exitCode = 1;
}
