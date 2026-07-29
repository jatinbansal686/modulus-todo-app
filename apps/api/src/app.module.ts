import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import configuration from './config/configuration';
import type { AppConfig } from './config/configuration';
import { envValidationSchema } from './config/env.validation';
import { DatabaseModule } from './database/database.module';
import { HealthModule } from './modules/health/health.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      load: [configuration],
      validationSchema: envValidationSchema,
      // Report every configuration problem at once rather than one per restart.
      validationOptions: { abortEarly: false },
    }),

    // A modest global ceiling. Auth routes get their own much stricter bucket,
    // declared on the controller itself where it is visible next to the endpoint.
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig, true>) => ({
        throttlers: [{ name: 'default', ttl: 60_000, limit: 120 }],
        // Skip throttling entirely in tests: the integration suite makes far more
        // requests per minute from one address than any real client would, and would
        // otherwise 429 itself.
        skipIf: () => config.get('nodeEnv', { infer: true }) === 'test',
      }),
    }),

    DatabaseModule,
    HealthModule,
  ],
  providers: [
    // Registered as providers rather than via `app.useGlobal*()` so they stay inside
    // the DI container — the filter needs an injected logger.
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
// The correlation-id middleware is registered in main.ts rather than here: it has to
// run before body parsing, and module-level middleware is always applied after it.
export class AppModule {}
