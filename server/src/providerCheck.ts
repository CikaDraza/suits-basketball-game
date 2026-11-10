import { createOpenAIMotionAgent, readProviderConfig } from './services/openaiMotionAgent.js';
import { AnalysisError } from './services/errors.js';

try {
  const agent = createOpenAIMotionAgent(readProviderConfig());
  const result = await agent.checkConnection();
  console.log(JSON.stringify({ ...result, recordingSent: false }));
} catch (error) {
  console.error(
    JSON.stringify({
      error: error instanceof AnalysisError ? error.code : 'provider_check_failed',
      message:
        error instanceof AnalysisError ? error.message : 'Provider check could not complete.',
    }),
  );
  process.exitCode = 1;
}
