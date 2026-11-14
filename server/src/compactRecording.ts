import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { ANALYSIS_LIMITS, prepareCapture } from '@suits/motion-contracts';

// Offline utility. No environment file, authentication token, network or provider request.
try {
  const file = process.argv[2];
  if (!file) throw new Error('missing-path');
  const path = resolve(process.env.INIT_CWD ?? process.cwd(), file);
  if ((await stat(path)).size > ANALYSIS_LIMITS.requestBytes) throw new Error('file-limit');
  const evidence = await prepareCapture(JSON.parse(await readFile(path, 'utf8')));
  console.log(JSON.stringify({ evidence }));
} catch {
  console.error(
    'Unable to prepare compact evidence. Pass a valid Motion Diagnostics v1 JSON file up to 10 MiB.',
  );
  process.exitCode = 1;
}
