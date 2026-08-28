import type { CorsOptions } from 'cors';

export const isProduction = () => process.env.NODE_ENV === 'production';

const productionAllowedOrigins = new Set([
  'https://n3xtime.com.br',
  'https://www.n3xtime.com.br',
  'https://api.n3xtime.com.br',
]);

const localOriginPattern = /^https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\]):([1-9]\d{0,4})$/i;

const isAllowedLocalOrigin = (origin: string) => {
  const match = localOriginPattern.exec(origin);
  if (!match) return false;

  const port = Number(match[1]);
  return Number.isInteger(port) && port >= 1 && port <= 65535;
};

export const isAllowedCorsOrigin = (origin?: string) => {
  // Requests without Origin include health checks, curl and server-to-server calls.
  if (!origin) return true;
  if (productionAllowedOrigins.has(origin)) return true;

  // localhost is intentionally disabled when NODE_ENV=production.
  return !isProduction() && isAllowedLocalOrigin(origin);
};

export const corsOptions: CorsOptions = {
  origin(origin, callback) {
    if (isAllowedCorsOrigin(origin)) {
      callback(null, true);
      return;
    }

    const error = Object.assign(new Error('Origin rejected by CORS policy.'), {
      code: 'CORS_ORIGIN_DENIED',
    });
    callback(error);
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Authorization', 'Content-Type', 'X-Request-Id'],
  exposedHeaders: ['RateLimit', 'RateLimit-Policy', 'Retry-After', 'X-Request-Id'],
  credentials: false,
  maxAge: 600,
  optionsSuccessStatus: 204,
};

const LOCAL_DEVELOPMENT_JWT_SECRET = 'n3xtime-local-development-secret';

export const getJwtSecret = () => {
  const configuredSecret = process.env.JWT_SECRET?.trim();

  if (!configuredSecret) {
    if (isProduction()) {
      throw new Error('JWT_SECRET não configurado. A API não pode iniciar em produção sem um segredo JWT.');
    }
    return LOCAL_DEVELOPMENT_JWT_SECRET;
  }

  if (configuredSecret.length < 32) {
    throw new Error('JWT_SECRET deve possuir pelo menos 32 caracteres.');
  }

  return configuredSecret;
};

export const assertSecurityConfiguration = () => {
  getJwtSecret();
};
