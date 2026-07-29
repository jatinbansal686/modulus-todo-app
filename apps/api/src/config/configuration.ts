/**
 * The single place `process.env` is read.
 *
 * Everything else injects `ConfigService` and asks for a typed key, so there is
 * exactly one file to look at to know what the app is configured by — and adding a
 * setting without also adding it to `env.validation.ts` is impossible to do quietly.
 */
/**
 * A duration in the format `@nestjs/jwt` accepts for `expiresIn` (ms.StringValue).
 * The `ms` package ships no resolvable types here, so this expresses the subset we
 * use. Joi enforces the same shape at boot, which is what makes the cast in this
 * file safe rather than wishful.
 */
export type Duration = `${number}${'s' | 'm' | 'h' | 'd'}`;

export interface AppConfig {
  nodeEnv: 'development' | 'test' | 'production';
  isProduction: boolean;
  port: number;
  trustProxy: number;
  corsOrigins: string[];
  database: { uri: string };
  auth: {
    accessSecret: string;
    accessTtl: Duration;
    refreshTtlDays: number;
    refreshPepper: string;
    passwordPepper: string;
    rateLimit: number;
  };
}

export default (): AppConfig => {
  const nodeEnv = (process.env.NODE_ENV ??
    'development') as AppConfig['nodeEnv'];

  return {
    nodeEnv,
    isProduction: nodeEnv === 'production',
    port: Number(process.env.PORT ?? 3000),
    trustProxy: Number(process.env.TRUST_PROXY ?? 0),
    corsOrigins: (process.env.CORS_ORIGINS ?? '')
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean),
    database: {
      uri: process.env.MONGODB_URI as string,
    },
    auth: {
      accessSecret: process.env.JWT_ACCESS_SECRET as string,
      accessTtl: (process.env.JWT_ACCESS_TTL ?? '15m') as Duration,
      refreshTtlDays: Number(process.env.JWT_REFRESH_TTL_DAYS ?? 30),
      refreshPepper: process.env.REFRESH_TOKEN_PEPPER as string,
      passwordPepper: process.env.PASSWORD_PEPPER as string,
      rateLimit: Number(process.env.AUTH_RATE_LIMIT ?? 10),
    },
  };
};
