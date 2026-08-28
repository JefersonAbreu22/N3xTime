import crypto from 'node:crypto';
import type { RequestHandler } from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { isProduction } from '../config/security.js';

const limiterDefaults = {
  standardHeaders: 'draft-7' as const,
  legacyHeaders: false,
};

export const createSecurityHeaders = () => helmet({
  // This service is a JSON API, not an HTML renderer. CSP belongs on the web app.
  contentSecurityPolicy: false,
  // Frontend and API live on different origins but on the same site.
  crossOriginResourcePolicy: { policy: 'same-site' },
  referrerPolicy: { policy: 'no-referrer' },
  strictTransportSecurity: isProduction()
    ? {
        maxAge: 31_536_000,
        includeSubDomains: true,
        preload: false,
      }
    : false,
});

export const requestIdMiddleware: RequestHandler = (req, res, next) => {
  const incomingRequestId = req.get('x-request-id');
  const requestId = incomingRequestId && /^[A-Za-z0-9._:-]{1,100}$/.test(incomingRequestId)
    ? incomingRequestId
    : crypto.randomUUID();

  res.setHeader('X-Request-Id', requestId);
  next();
};

export const noStoreMiddleware: RequestHandler = (_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  next();
};

export const apiRateLimiter = rateLimit({
  ...limiterDefaults,
  windowMs: 5 * 60 * 1000,
  limit: 600,
  skip: (req) => req.method === 'OPTIONS' || req.path === '/api/health',
  message: { success: false, error: 'Muitas requisições. Aguarde alguns instantes e tente novamente.' },
});

export const loginRateLimiter = rateLimit({
  ...limiterDefaults,
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true,
  message: { success: false, error: 'Muitas tentativas de login. Aguarde 15 minutos antes de tentar novamente.' },
});

export const kioskLoginRateLimiter = rateLimit({
  ...limiterDefaults,
  windowMs: 5 * 60 * 1000,
  limit: 30,
  skipSuccessfulRequests: true,
  message: { success: false, error: 'Muitas tentativas no terminal. Aguarde alguns minutos e tente novamente.' },
});

export const publicLookupRateLimiter = rateLimit({
  ...limiterDefaults,
  windowMs: 5 * 60 * 1000,
  limit: 60,
  message: { success: false, error: 'Muitas consultas. Aguarde alguns minutos e tente novamente.' },
});

export const passwordResetRequestLimiter = rateLimit({
  ...limiterDefaults,
  windowMs: 15 * 60 * 1000,
  limit: 5,
  message: { success: false, error: 'Muitas solicitações. Aguarde alguns minutos antes de tentar novamente.' },
});

export const passwordResetLimiter = rateLimit({
  ...limiterDefaults,
  windowMs: 15 * 60 * 1000,
  limit: 10,
  message: { success: false, error: 'Muitas tentativas. Aguarde alguns minutos antes de tentar novamente.' },
});
