import { z } from 'zod';

const ConfigSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.enum(['127.0.0.1', '0.0.0.0', '::1']).default('127.0.0.1'),
  PORT: z.coerce.number().int().min(0).max(65535).default(3001),
  MOTION_ANALYSIS_TOKEN: z.string().min(32).max(256),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().max(120).optional(),
});
export function readConfig(env: NodeJS.ProcessEnv = process.env) {
  const parsed = ConfigSchema.safeParse(env);
  if (!parsed.success)
    throw new Error(
      'Invalid analysis API configuration. Set a server-only MOTION_ANALYSIS_TOKEN (at least 32 characters), and check HOST/PORT.',
    );
  return {
    nodeEnv: parsed.data.NODE_ENV,
    host: parsed.data.HOST,
    port: parsed.data.PORT,
    accessToken: parsed.data.MOTION_ANALYSIS_TOKEN,
    openaiApiKey: parsed.data.OPENAI_API_KEY?.trim() || undefined,
    model: parsed.data.OPENAI_MODEL?.trim() || undefined,
  };
}
export type ServerConfig = ReturnType<typeof readConfig>;
