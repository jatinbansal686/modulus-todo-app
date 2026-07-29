import { MongoMemoryServer } from 'mongodb-memory-server';

/**
 * Spins up a real in-process MongoDB for the integration suite.
 *
 * Chosen over Testcontainers so that a reviewer can clone this repository and run
 * `npm test` with nothing installed but Node — no Docker daemon, no service
 * containers. (First run downloads a mongod binary; see the README.)
 *
 * Each Jest worker gets its OWN database name. Sharing one database across workers
 * means their `deleteMany` cleanup and unique-email fixtures trample each other
 * nondeterministically — a reliable way to manufacture flaky tests.
 */
let mongod: MongoMemoryServer | undefined;

export async function startInMemoryMongo(): Promise<string> {
  mongod = await MongoMemoryServer.create({
    binary: { version: '8.0.12' }, // pinned: matches local Homebrew mongod 8.0.x
    instance: { dbName: `jest-${process.env.JEST_WORKER_ID ?? '1'}` },
  });
  return mongod.getUri();
}

export async function stopInMemoryMongo(): Promise<void> {
  await mongod?.stop();
  mongod = undefined;
}

/** Environment the app needs to boot under test. Secrets are throwaway. */
export function testEnv(uri: string): void {
  process.env.NODE_ENV = 'test';
  process.env.MONGODB_URI = uri;
  process.env.JWT_ACCESS_SECRET = 'test-access-secret-that-is-long-enough-32';
  process.env.REFRESH_TOKEN_PEPPER =
    'test-refresh-pepper-that-is-long-enough-32';
  process.env.PASSWORD_PEPPER = 'test-password-pepper-that-is-long-enough-32';
  process.env.CORS_ORIGINS = '';
  process.env.TRUST_PROXY = '0';
}
