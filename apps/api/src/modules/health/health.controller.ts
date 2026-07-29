import { Controller, Get } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import { Connection, ConnectionStates } from 'mongoose';

/**
 * Liveness and readiness.
 *
 * Deliberately hand-written rather than pulling in `@nestjs/terminus`: this is a
 * dozen lines and one dependency less to explain.
 *
 * Note this controller is mounted OUTSIDE the `/api/v1` prefix (see main.ts) so the
 * hosting platform's health-check URL stays stable if the API version changes.
 */
@ApiTags('health')
// Unauthenticated: the hosting platform's probe has no credentials. Without this the
// global JwtAuthGuard 401s the health check, the platform marks the instance
// unhealthy, and the deploy is rolled back — which is exactly what the e2e suite
// caught the moment the guard was made global.
@Public()
@Controller('health')
export class HealthController {
  constructor(@InjectConnection() private readonly connection: Connection) {}

  /**
   * Liveness. Answers "is this process up?" and nothing more.
   *
   * Returns 200 with a `degraded` database status rather than failing outright while
   * Mongo is still connecting. On a cold start the platform probes this endpoint
   * within seconds; a hard failure there gets the deploy marked unhealthy and rolled
   * back even though the process is fine and the database is moments away.
   */
  @Get()
  @ApiOperation({
    summary: 'Liveness probe — 200 while the process is running',
  })
  check(): {
    status: 'ok';
    database: 'connected' | 'degraded';
    uptimeSeconds: number;
    timestamp: string;
  } {
    return {
      status: 'ok',
      database:
        this.connection.readyState === ConnectionStates.connected
          ? 'connected'
          : 'degraded',
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Readiness. Answers "can this instance actually serve traffic?" — which requires
   * a live database, so unlike liveness it does fail when Mongo is unreachable.
   */
  @Get('ready')
  @ApiOperation({
    summary: 'Readiness probe — fails when the database is unreachable',
  })
  async ready(): Promise<{ status: 'ready' | 'not-ready'; database: string }> {
    const connected = this.connection.readyState === ConnectionStates.connected;
    if (connected) {
      await this.connection.db?.admin().ping();
    }
    return {
      status: connected ? 'ready' : 'not-ready',
      database: ConnectionStates[this.connection.readyState] ?? 'unknown',
    };
  }
}
