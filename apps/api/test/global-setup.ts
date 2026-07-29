import { MongoMemoryServer } from 'mongodb-memory-server';

/**
 * Jest `globalSetup` — runs once, BEFORE any test module is imported.
 *
 * That ordering is the entire point. `AppModule` is imported at the top of the spec
 * file, and `ConfigModule.forRoot()` validates the environment while that import is
 * evaluated — i.e. before any `beforeAll` hook has had a chance to run. Setting the
 * env inside `beforeAll` therefore happens too late.
 *
 * This was originally missed because a local `.env` file silently satisfied the
 * validation, so the suite passed on my machine and failed in CI with
 * `"MONGODB_URI" is required`. The tests were quietly depending on developer-local
 * state; now they are hermetic.
 */
module.exports = async function globalSetup(): Promise<void> {
  const mongod = await MongoMemoryServer.create({
    binary: { version: '8.0.12' }, // pinned; matches the local Homebrew mongod line
    instance: { dbName: 'modulus_todo_test' },
  });

  // Stashed on globalThis so globalTeardown can stop the same instance.
  (globalThis as { __MONGOD__?: MongoMemoryServer }).__MONGOD__ = mongod;

  process.env.NODE_ENV = 'test';
  process.env.MONGODB_URI = mongod.getUri();
  // Throwaway values, but they must satisfy the real Joi schema — including its
  // 32-character minimums — so the tests exercise the same validation as production.
  process.env.JWT_ACCESS_SECRET = 'test-access-secret-that-is-long-enough-32';
  process.env.REFRESH_TOKEN_PEPPER =
    'test-refresh-pepper-that-is-long-enough-32';
  process.env.PASSWORD_PEPPER = 'test-password-pepper-that-is-long-enough-32';
  process.env.CORS_ORIGINS = '';
  process.env.TRUST_PROXY = '0';
};
