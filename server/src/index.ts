import { createApp } from './app.js';
import { readConfig } from './config.js';

try {
  const config = readConfig();
  const server = createApp(config).listen(config.port, config.host, () => {
    console.log(
      `SUITS analysis API listening on ${config.host}:${(server.address() as { port: number }).port}`,
    );
  });
  server.headersTimeout = 10_000;
  server.requestTimeout = 30_000;
  server.on('error', () => {
    console.error('Analysis API could not start. Check HOST/PORT and local permissions.');
    process.exitCode = 1;
  });
  for (const signal of ['SIGINT', 'SIGTERM'] as const)
    process.once(signal, () => {
      server.close();
      server.closeIdleConnections();
    });
} catch {
  console.error('Analysis API configuration is invalid. Check server/.env and server/README.md.');
  process.exitCode = 1;
}
