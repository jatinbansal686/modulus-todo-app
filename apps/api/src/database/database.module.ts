import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import type { AppConfig } from '../config/configuration';

@Module({
  imports: [
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig, true>) => ({
        uri: config.get('database', { infer: true }).uri,

        // Tuned for a small free-tier instance rather than left on the defaults.
        //
        // maxPoolSize: the default of 100 is meaningless on a 0.1-CPU dyno and just
        // holds open connections against an Atlas M0's own low connection ceiling.
        //
        // serverSelectionTimeoutMS: the default is 30s. On a cold start that stall
        // outlasts the platform's health-check window, so the deploy gets marked
        // unhealthy and rolled back before Mongo has finished waking up. 5s fails
        // fast enough to stay inside it.
        maxPoolSize: 5,
        minPoolSize: 1,
        serverSelectionTimeoutMS: 5_000,
        socketTimeoutMS: 45_000,

        // Build indexes automatically outside production. In production they are
        // created once by a deploy step instead, so a rolling restart never triggers
        // a surprise index build against live traffic.
        //
        // NOTE: `strictQuery` deliberately not set here — it is a Mongoose *global*,
        // not a connection option, and passing it through this factory forwards it to
        // the MongoDB driver, which rejects it with `option strictquery is not supported`.
        autoIndex: config.get('nodeEnv', { infer: true }) !== 'production',
      }),
    }),
  ],
})
export class DatabaseModule {}
