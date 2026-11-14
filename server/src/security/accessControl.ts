import { createHash, timingSafeEqual } from 'node:crypto';
import type { RequestHandler } from 'express';

export function developerAccess(token: string): RequestHandler {
  const expected = createHash('sha256').update(token).digest();
  return (req, res, next) => {
    // No browser credentials are shipped in 1A. Browser integration needs user auth in 1D.
    if (req.headers.origin) {
      res.status(403).json({
        error: {
          code: 'browser_access_disabled',
          message: 'Use the authenticated developer API client.',
        },
      });
      return;
    }
    const authorization = req.headers.authorization ?? '';
    if (
      !authorization.startsWith('Bearer ') ||
      authorization.length > 263 ||
      !timingSafeEqual(createHash('sha256').update(authorization.slice(7)).digest(), expected)
    ) {
      res.status(401).json({
        error: { code: 'unauthorized', message: 'Developer authentication is required.' },
      });
      return;
    }
    next();
  };
}
/** Single-process, bounded developer limits. No proxy-supplied IP is trusted. */
export function admissionControl(now: () => number = Date.now): RequestHandler {
  const callers = new Map<string, { start: number; count: number }>();
  let active = 0;
  return (req, res, next) => {
    const ip = req.ip ?? 'unknown',
      time = now();
    let entry = callers.get(ip);
    if (!entry || time - entry.start >= 60_000) {
      entry = { start: time, count: 0 };
      callers.set(ip, entry);
    }
    if (callers.size > 512) callers.delete(callers.keys().next().value!);
    if (++entry.count > 20 || active >= 2) {
      res.setHeader('Retry-After', '60');
      res
        .status(429)
        .json({ error: { code: 'rate_limited', message: 'Developer request limit reached.' } });
      return;
    }
    active++;
    let released = false;
    const release = () => {
      if (!released) {
        active--;
        released = true;
      }
    };
    res.once('finish', release);
    res.once('close', release);
    next();
  };
}
