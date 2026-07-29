import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import mongoose from 'mongoose';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/bootstrap/configure-app';
import type { ErrorEnvelope } from '../src/common/errors/error-codes';
import { startInMemoryMongo, stopInMemoryMongo, testEnv } from './setup-e2e';

/** supertest types `res.body` as `any`; these give the assertions a real shape to
 *  check against, which is the whole point of testing the envelope contract. */
interface HealthBody {
  status: string;
  database: string;
  uptimeSeconds: number;
}
const asError = (body: unknown): ErrorEnvelope => body as ErrorEnvelope;
const asHealth = (body: unknown): HealthBody => body as HealthBody;

/**
 * Foundation-level integration tests.
 *
 * These assert the *shape* of the error envelope, not just status codes. The mobile
 * client branches on `code`, so an envelope regression would break the app while
 * every status code still looked correct.
 */
describe('API foundation (e2e)', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    testEnv(await startInMemoryMongo());

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({
      bodyParser: false,
    });

    // The SAME configuration function main.ts uses — not a copy of it. A hand-rolled
    // mirror here had already drifted (helmet was missing), which meant the suite was
    // testing a different app than the one that ships.
    configureApp(app);

    await app.init();

    // Mongoose builds indexes asynchronously after connect. Without this, a test that
    // depends on a unique index can run before the index exists and pass locally
    // while failing at random in CI.
    await mongoose.connection.syncIndexes().catch(() => undefined);
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await stopInMemoryMongo();
  });

  describe('health', () => {
    it('reports liveness with a connected database', async () => {
      const res = await request(app.getHttpServer()).get('/health').expect(200);
      const body = asHealth(res.body);
      expect(body).toMatchObject({ status: 'ok', database: 'connected' });
      expect(typeof body.uptimeSeconds).toBe('number');
    });

    it('reports readiness', async () => {
      const res = await request(app.getHttpServer())
        .get('/health/ready')
        .expect(200);
      expect(asHealth(res.body)).toMatchObject({ status: 'ready' });
    });

    it('keeps health outside the /api/v1 prefix so probe URLs survive a version bump', async () => {
      await request(app.getHttpServer()).get('/api/v1/health').expect(404);
    });
  });

  describe('error envelope', () => {
    it('returns a complete envelope for an unknown route', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/does-not-exist')
        .expect(404);

      const body = asError(res.body);
      expect(body).toMatchObject({
        statusCode: 404,
        code: 'NOT_FOUND',
        path: '/api/v1/does-not-exist',
      });
      // Every field the client relies on must be present.
      expect(body.requestId).toEqual(expect.any(String));
      expect(body.requestId).not.toBe('-');
      expect(body.timestamp).toEqual(expect.any(String));
    });

    it('distinguishes malformed JSON from a validation failure', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/does-not-exist')
        .set('content-type', 'application/json')
        .send('{not valid json')
        .expect(400);

      // Specifically NOT 'VALIDATION_FAILED' — that would send the app hunting for a
      // bad field when the body never parsed at all.
      expect(asError(res.body).code).toBe('MALFORMED_JSON');
      expect(asError(res.body).requestId).not.toBe('-');
    });

    it('rejects an oversized body with 413 rather than a redacted 500', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/does-not-exist')
        .set('content-type', 'application/json')
        .send(`{"a":"${'x'.repeat(300_000)}"}`)
        .expect(413);

      expect(asError(res.body).code).toBe('PAYLOAD_TOO_LARGE');
    });

    it('echoes a caller-supplied request id so a trace survives a proxy hop', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/does-not-exist')
        .set('x-request-id', 'trace-me-123')
        .expect(404);

      expect(asError(res.body).requestId).toBe('trace-me-123');
      expect(res.headers['x-request-id']).toBe('trace-me-123');
    });
  });

  describe('security headers', () => {
    it('sets helmet headers on responses', async () => {
      const res = await request(app.getHttpServer()).get('/health').expect(200);
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers).toHaveProperty('content-security-policy');
    });
  });
});
