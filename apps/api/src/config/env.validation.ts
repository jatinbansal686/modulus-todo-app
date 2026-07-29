import * as Joi from 'joi';

/**
 * Environment schema.
 *
 * Validated once at boot with `abortEarly: false`, so a misconfigured deployment
 * fails immediately with the *complete* list of problems rather than dying on the
 * first request — or, worse, silently running with an undefined JWT secret.
 *
 * Every value the app reads must appear here. Nothing outside `configuration.ts`
 * is allowed to touch `process.env`.
 */
export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'test', 'production')
    .default('development'),

  // Render (and most PaaS) inject PORT. Binding to a hardcoded port is the most
  // common first-deploy failure there — the platform's port scan times out.
  PORT: Joi.number().port().default(3000),

  MONGODB_URI: Joi.string()
    .uri({ scheme: ['mongodb', 'mongodb+srv'] })
    .required(),

  // 32 bytes minimum. A short secret is the difference between "signed" and "signed
  // by anyone who can run a wordlist".
  JWT_ACCESS_SECRET: Joi.string().min(32).required(),
  // Pattern-enforced so the `as Duration` cast in configuration.ts is guaranteed
  // correct at runtime rather than assumed.
  JWT_ACCESS_TTL: Joi.string()
    .pattern(/^\d+[smhd]$/)
    .default('15m'),
  JWT_REFRESH_TTL_DAYS: Joi.number().integer().min(1).default(30),

  // Pepper for hashing refresh tokens. Distinct from the JWT secret so that rotating
  // one does not invalidate the other.
  REFRESH_TOKEN_PEPPER: Joi.string().min(32).required(),

  // Argon2id pepper, passed as argon2's native `secret` option.
  PASSWORD_PEPPER: Joi.string().min(32).required(),

  // Comma-separated allowlist. Never '*' — see main.ts.
  // `.allow('')` because empty is a meaningful value here (no browser origins, which
  // is the normal case for a mobile-only client); Joi rejects empty strings by default.
  CORS_ORIGINS: Joi.string().allow('').default(''),

  // Auth endpoints get a strict bucket. Relaxed in `test` so the integration suite —
  // which legitimately makes far more than a handful of auth calls a minute from one
  // IP — does not 429 itself.
  AUTH_RATE_LIMIT: Joi.number().integer().min(1).default(10),

  // Set to 1 behind a reverse proxy (Render, Heroku, nginx). Without it Express
  // reports the proxy's address as req.ip for every caller, which silently turns a
  // per-IP rate limit into a single global one.
  TRUST_PROXY: Joi.number().integer().min(0).default(0),
});
