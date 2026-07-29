/**
 * The single place `process.env` is read.
 *
 * Everything else injects `ConfigService` and asks for a typed key, so there is
 * exactly one file to look at to know what the app is configured by — and adding a
 * setting without also adding it to `env.validation.ts` is impossible to do quietly.
 */
export interface AppConfig {
  nodeEnv: 'development' | 'test' | 'production';
  isProduction: boolean;
  port: number;
  trustProxy: number;
  corsOrigins: string[];
  database: { uri: string };
  auth: {
    accessSecret: string;
    accessTtl: string;
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
      accessTtl: process.env.JWT_ACCESS_TTL ?? '15m',
      refreshTtlDays: Number(process.env.JWT_REFRESH_TTL_DAYS ?? 30),
      refreshPepper: process.env.REFRESH_TOKEN_PEPPER as string,
      passwordPepper: process.env.PASSWORD_PEPPER as string,
      rateLimit: Number(process.env.AUTH_RATE_LIMIT ?? 10),
    },
  };
};
