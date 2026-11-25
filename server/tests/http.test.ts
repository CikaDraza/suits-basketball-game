import assert from 'node:assert/strict';
import { once } from 'node:events';
import { after, test } from 'node:test';
import type { Server } from 'node:http';
import { ANALYSIS_LIMITS } from '@suits/motion-contracts';
import { createApp } from '../src/app.js';
import { readConfig } from '../src/config.js';
import { recording, token } from './fixtures.js';

const servers: Server[] = [];
after(async () => {
  await Promise.all(
    servers.map(
      (server) =>
        new Promise<void>((resolve) => {
          server.close(() => resolve());
          server.closeAllConnections();
        }),
    ),
  );
});
async function start(now?: () => number) {
  const server = createApp(
    readConfig({ NODE_ENV: 'test', MOTION_ANALYSIS_TOKEN: token }),
    now,
  ).listen(0, '127.0.0.1');
  servers.push(server);
  await once(server, 'listening');
  return `http://127.0.0.1:${(server.address() as { port: number }).port}`;
}
const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
const body = () => JSON.stringify({ recording: recording() });

test('health and authenticated preparation work with no OpenAI key; no raw data is stored or returned', async () => {
  const base = await start();
  const health = await fetch(`${base}/health`);
  assert.equal(health.status, 200);
  assert.equal(health.headers.get('x-powered-by'), null);
  const response = await fetch(`${base}/api/motion-analysis/prepare`, {
    method: 'POST',
    headers,
    body: body(),
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const data = await response.json();
  assert.equal(data.aiCalled, false);
  assert.equal(data.evidence.sourceVerification, 'unverified');
  const text = JSON.stringify(data);
  assert.ok(!text.includes('PRIVATE_'));
  assert.ok(!text.includes(token));
});
test('missing/bad bearer and any browser origin are rejected before parsing', async () => {
  const base = await start(),
    url = `${base}/api/motion-analysis/prepare`;
  assert.equal((await fetch(url, { method: 'POST', body: '{broken' })).status, 401);
  assert.equal(
    (
      await fetch(url, {
        method: 'POST',
        headers: { ...headers, authorization: 'Bearer wrong' },
        body: '{broken',
      })
    ).status,
    401,
  );
  assert.equal(
    (
      await fetch(url, {
        method: 'POST',
        headers: { ...headers, origin: 'https://attacker.invalid' },
        body: body(),
      })
    ).status,
    403,
  );
});
test('bad JSON, unsupported versions/types/encoding and oversized requests fail with sanitized JSON', async () => {
  const base = await start(),
    url = `${base}/api/motion-analysis/prepare`;
  assert.equal((await fetch(url, { method: 'POST', headers, body: '{"broken-key":' })).status, 400);
  const invalid = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ recording: { ...recording(), schemaVersion: 99 } }),
  });
  assert.equal(invalid.status, 422);
  assert.ok(!(await invalid.text()).includes('stack'));
  assert.equal(
    (
      await fetch(url, {
        method: 'POST',
        headers: { ...headers, 'content-type': 'text/plain' },
        body: body(),
      })
    ).status,
    415,
  );
  assert.equal(
    (
      await fetch(url, {
        method: 'POST',
        headers: { ...headers, 'content-encoding': 'gzip' },
        body: 'not-gzip',
      })
    ).status,
    415,
  );
  assert.equal(
    (
      await fetch(url, {
        method: 'POST',
        headers,
        body: ' '.repeat(ANALYSIS_LIMITS.requestBytes + 1),
      })
    ).status,
    413,
  );
});
test('the paid analysis route is not exposed in 1A and client model overrides are rejected', async () => {
  const base = await start();
  assert.equal(
    (await fetch(`${base}/api/motion-analysis`, { method: 'POST', headers, body: body() })).status,
    404,
  );
  assert.equal(
    (
      await fetch(`${base}/api/motion-analysis/prepare`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ recording: recording(), model: 'attacker-choice' }),
      })
    ).status,
    422,
  );
});
test('developer limits apply before authentication and ignore forwarded IP spoofing', async () => {
  let now = 0;
  const base = await start(() => now),
    url = `${base}/api/motion-analysis/prepare`;
  for (let i = 0; i < 20; i++)
    assert.equal(
      (await fetch(url, { method: 'POST', headers: { 'x-forwarded-for': `203.0.113.${i}` } }))
        .status,
      401,
    );
  const limited = await fetch(url, { method: 'POST', headers, body: body() });
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get('retry-after'), '60');
  now = 60_001;
  assert.equal((await fetch(url, { method: 'POST', headers, body: body() })).status, 200);
});
test('configuration rejects missing/short developer token and unsafe host binding', () => {
  assert.throws(() => readConfig({}));
  assert.throws(() => readConfig({ MOTION_ANALYSIS_TOKEN: 'short' }));
  assert.throws(() => readConfig({ MOTION_ANALYSIS_TOKEN: token, HOST: 'user-input.invalid' }));
});
