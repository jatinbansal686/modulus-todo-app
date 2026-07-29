import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { JwtService } from '@nestjs/jwt';
import mongoose from 'mongoose';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/bootstrap/configure-app';

interface Tokens {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: string;
  user: { id: string; email: string; displayName?: string };
}
interface Err {
  statusCode: number;
  code: string;
  message: string;
  details?: { field: string; constraint: string }[];
}

const asTokens = (b: unknown): Tokens => b as Tokens;
const asErr = (b: unknown): Err => b as Err;

describe('Auth (e2e)', () => {
  let app: NestExpressApplication;
  let jwt: JwtService;
  let seq = 0;

  /** Unique address per test so no test depends on another's cleanup. */
  const freshEmail = () => `user${++seq}.${Date.now()}@example.com`;
  const PASSWORD = 'correct horse battery staple';

  const register = (email: string, password = PASSWORD, extra: object = {}) =>
    request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email, password, ...extra });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({
      bodyParser: false,
    });
    configureApp(app);
    await app.init();
    jwt = app.get(JwtService);

    // Index builds are asynchronous; without this the unique-email test can run
    // before the index exists and pass locally while failing at random in CI.
    await mongoose.connection.syncIndexes();
  }, 120_000);

  afterAll(async () => {
    await app?.close();
  });

  describe('registration', () => {
    it('creates an account and signs the user straight in', async () => {
      const email = freshEmail();
      const res = await register(email, PASSWORD, {
        displayName: 'Ada',
      }).expect(201);
      const body = asTokens(res.body);

      expect(body.accessToken).toEqual(expect.any(String));
      expect(body.refreshToken).toEqual(expect.any(String));
      expect(body.user).toMatchObject({ email, displayName: 'Ada' });
      // Client needs this to refresh proactively instead of waiting for a 401.
      expect(new Date(body.accessTokenExpiresAt).getTime()).toBeGreaterThan(
        Date.now(),
      );
    });

    it('never lets the password hash escape in a response', async () => {
      const res = await register(freshEmail()).expect(201);
      // Assert on the raw serialised body: a nested or renamed field would slip past
      // a property-by-property check.
      expect(JSON.stringify(res.body)).not.toContain('$argon2');
      expect(JSON.stringify(res.body)).not.toContain('passwordHash');
    });

    it('rejects a duplicate email with 409', async () => {
      const email = freshEmail();
      await register(email).expect(201);
      const res = await register(email).expect(409);
      expect(asErr(res.body).code).toBe('EMAIL_ALREADY_REGISTERED');
    });

    it('rejects a weak password with field-level detail', async () => {
      const res = await register(freshEmail(), 'short').expect(400);
      const body = asErr(res.body);
      expect(body.code).toBe('VALIDATION_FAILED');
      expect(body.details?.some((d) => d.field === 'password')).toBe(true);
    });

    it('rejects unknown properties rather than silently dropping them', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({ email: freshEmail(), password: PASSWORD, isAdmin: true })
        .expect(400);
      expect(asErr(res.body).code).toBe('VALIDATION_FAILED');
    });
  });

  describe('login', () => {
    it('returns tokens for correct credentials', async () => {
      const email = freshEmail();
      await register(email).expect(201);

      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email, password: PASSWORD })
        .expect(200);

      expect(asTokens(res.body).accessToken).toEqual(expect.any(String));
    });

    it('is case-insensitive about the email', async () => {
      const email = freshEmail();
      await register(email).expect(201);

      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: email.toUpperCase(), password: PASSWORD })
        .expect(200);
    });

    it('gives the SAME answer for a wrong password and an unknown account', async () => {
      const email = freshEmail();
      await register(email).expect(201);

      const wrongPassword = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email, password: 'not the right password' })
        .expect(401);

      const noSuchUser = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: freshEmail(), password: PASSWORD })
        .expect(401);

      // Any divergence here turns login into an account-enumeration oracle.
      expect(asErr(wrongPassword.body).code).toBe('AUTH_CREDENTIALS_INVALID');
      expect(asErr(noSuchUser.body).code).toBe('AUTH_CREDENTIALS_INVALID');
      expect(asErr(wrongPassword.body).message).toBe(
        asErr(noSuchUser.body).message,
      );
    });
  });

  describe('access token verification', () => {
    it('rejects a request with no token', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/logout-all')
        .expect(401);
      expect(asErr(res.body).code).toBe('AUTH_TOKEN_MISSING');
    });

    it('rejects a malformed token as INVALID, not EXPIRED', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/logout-all')
        .set('authorization', 'Bearer not-a-jwt')
        .expect(401);
      expect(asErr(res.body).code).toBe('AUTH_TOKEN_INVALID');
    });

    it('rejects a token signed with the wrong secret', async () => {
      const forged = await jwt.signAsync(
        { sub: '507f1f77bcf86cd799439011', email: 'a@b.c', jti: 'x' },
        {
          secret: 'a-different-secret-that-is-long-enough-32',
          algorithm: 'HS256',
        },
      );
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/logout-all')
        .set('authorization', `Bearer ${forged}`)
        .expect(401);
      expect(asErr(res.body).code).toBe('AUTH_TOKEN_INVALID');
    });

    it('rejects an unsigned `alg: none` token', async () => {
      // Hand-built because no library will produce this: the classic algorithm-
      // confusion attack, closed by pinning algorithms: ['HS256'] on verify.
      const b64 = (o: object) =>
        Buffer.from(JSON.stringify(o)).toString('base64url');
      const none = `${b64({ alg: 'none', typ: 'JWT' })}.${b64({
        sub: '507f1f77bcf86cd799439011',
        email: 'a@b.c',
        jti: 'x',
      })}.`;

      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/logout-all')
        .set('authorization', `Bearer ${none}`)
        .expect(401);
      expect(asErr(res.body).code).toBe('AUTH_TOKEN_INVALID');
    });

    it('reports an expired token as EXPIRED so the client knows to refresh', async () => {
      const email = freshEmail();
      const reg = await register(email).expect(201);
      const { user } = asTokens(reg.body);

      // Signed with the real secret but already expired — this is the distinction the
      // mobile client's 401 handling depends on: EXPIRED means "refresh and retry",
      // INVALID means "give up and sign out".
      const expired = await jwt.signAsync(
        { sub: user.id, email, jti: 'expired' },
        {
          secret: process.env.JWT_ACCESS_SECRET as string,
          algorithm: 'HS256',
          expiresIn: '-1s',
        },
      );

      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/logout-all')
        .set('authorization', `Bearer ${expired}`)
        .expect(401);
      expect(asErr(res.body).code).toBe('AUTH_TOKEN_EXPIRED');
    });
  });

  describe('refresh', () => {
    it('issues a new access token and returns the same refresh token', async () => {
      const reg = await register(freshEmail()).expect(201);
      const original = asTokens(reg.body);

      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: original.refreshToken })
        .expect(200);
      const refreshed = asTokens(res.body);

      expect(refreshed.accessToken).toEqual(expect.any(String));
      // Rotation is a later milestone. Asserted explicitly so that when rotation does
      // land, this test fails and forces the client's keystore-write path to be
      // revisited rather than silently breaking.
      expect(refreshed.refreshToken).toBe(original.refreshToken);
    });

    it('rejects a garbage refresh token', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: 'nonsense' })
        .expect(401);
      expect(asErr(res.body).code).toBe('AUTH_TOKEN_INVALID');
    });
  });

  describe('logout', () => {
    it('revokes the session so the refresh token stops working', async () => {
      const reg = await register(freshEmail()).expect(201);
      const { refreshToken } = asTokens(reg.body);

      await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken })
        .expect(200);

      await request(app.getHttpServer())
        .post('/api/v1/auth/logout')
        .send({ refreshToken })
        .expect(204);

      // The whole point of an opaque, server-stored token: revocation is immediate.
      await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken })
        .expect(401);
    });

    it('is idempotent', async () => {
      const reg = await register(freshEmail()).expect(201);
      const { refreshToken } = asTokens(reg.body);

      await request(app.getHttpServer())
        .post('/api/v1/auth/logout')
        .send({ refreshToken })
        .expect(204);
      await request(app.getHttpServer())
        .post('/api/v1/auth/logout')
        .send({ refreshToken })
        .expect(204);
    });

    it('logout-all revokes every session, not just the one presented', async () => {
      const email = freshEmail();
      await register(email).expect(201);

      // Two independent logins => two separate sessions/families.
      const a = asTokens(
        (
          await request(app.getHttpServer())
            .post('/api/v1/auth/login')
            .send({ email, password: PASSWORD })
            .expect(200)
        ).body,
      );
      const b = asTokens(
        (
          await request(app.getHttpServer())
            .post('/api/v1/auth/login')
            .send({ email, password: PASSWORD })
            .expect(200)
        ).body,
      );

      await request(app.getHttpServer())
        .post('/api/v1/auth/logout-all')
        .set('authorization', `Bearer ${a.accessToken}`)
        .expect(204);

      // Session B must die too — this is what distinguishes logout-all from logout,
      // and it only works because revocation is keyed on userId rather than familyId.
      for (const token of [a.refreshToken, b.refreshToken]) {
        await request(app.getHttpServer())
          .post('/api/v1/auth/refresh')
          .send({ refreshToken: token })
          .expect(401);
      }
    });
  });
});
