import express, { type ErrorRequestHandler } from 'express';
import { ANALYSIS_LIMITS } from '@suits/motion-contracts';
import type { ServerConfig } from './config.js';
import { admissionControl, developerAccess } from './security/accessControl.js';
import { motionAnalysisRoutes } from './routes/motionAnalysis.js';
import { AnalysisError } from './services/errors.js';

export function createApp(config: ServerConfig, now?: () => number) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', false);
  app.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    next();
  });
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'suits-motion-analysis' });
  });
  app.use(
    '/api/motion-analysis',
    admissionControl(now),
    developerAccess(config.accessToken),
    (req, res, next) => {
      if (req.headers['content-encoding'] && req.headers['content-encoding'] !== 'identity') {
        res
          .status(415)
          .json({ error: { code: 'unsupported_encoding', message: 'Send uncompressed JSON.' } });
        return;
      }
      if (!req.is('application/json')) {
        res
          .status(415)
          .json({ error: { code: 'unsupported_content_type', message: 'Send application/json.' } });
        return;
      }
      next();
    },
    express.json({ limit: ANALYSIS_LIMITS.requestBytes, inflate: false, strict: true }),
    motionAnalysisRoutes(),
  );
  app.use((_req, res) => {
    res.status(404).json({ error: { code: 'not_found', message: 'Endpoint not found.' } });
  });
  const errors: ErrorRequestHandler = (err: unknown, _req, res, next) => {
    if (res.headersSent) {
      next(new AnalysisError('internal_error', 500, 'Unable to prepare recording.'));
      return;
    }
    if (err instanceof AnalysisError) {
      res.status(err.status).json({ error: { code: err.code, message: err.message } });
      return;
    }
    const type = err && typeof err === 'object' && 'type' in err ? err.type : null;
    if (type === 'entity.too.large') {
      res.status(413).json({
        error: {
          code: 'request_too_large',
          message: 'Recording exceeds the request size limit.',
        },
      });
      return;
    }
    if (type === 'charset.unsupported' || type === 'encoding.unsupported') {
      res.status(415).json({
        error: { code: 'unsupported_encoding', message: 'Send uncompressed UTF-8 JSON.' },
      });
      return;
    }
    if (type === 'entity.parse.failed') {
      res
        .status(400)
        .json({ error: { code: 'invalid_json', message: 'Request body must be valid JSON.' } });
      return;
    }
    res
      .status(500)
      .json({ error: { code: 'internal_error', message: 'Unable to prepare recording.' } });
  };
  app.use(errors);
  return app;
}
