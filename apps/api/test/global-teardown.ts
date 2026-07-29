import type { MongoMemoryServer } from 'mongodb-memory-server';

/** Stops the in-memory MongoDB started by `global-setup.ts`. */
module.exports = async function globalTeardown(): Promise<void> {
  const mongod = (globalThis as { __MONGOD__?: MongoMemoryServer }).__MONGOD__;
  await mongod?.stop();
};
