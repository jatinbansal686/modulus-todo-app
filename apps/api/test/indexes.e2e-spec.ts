import { Test } from '@nestjs/testing';
import { getConnectionToken } from '@nestjs/mongoose';
import type { Connection } from 'mongoose';
import { AppModule } from '../src/app.module';
import { syncDatabaseIndexes } from '../src/database/sync-indexes';

/**
 * Proves the declared indexes actually exist after a production-style boot.
 *
 * ## Why this test earns its place
 *
 * `autoIndex` is disabled in production, and for a while nothing created the indexes
 * instead. That is invisible to every other test in this suite, because they all run
 * with `autoIndex` on — and it is invisible in development for the same reason. The
 * only place it showed up was the deployed instance, where `users.email` had no
 * unique constraint and reuse detection had no unique `tokenHash`.
 *
 * So this test does what production does: it drops every index, then runs the same
 * bootstrap step `main.ts` runs, then asserts the guarantees are back. Remove
 * `syncDatabaseIndexes` from `main.ts` and this fails.
 */
describe('database indexes (e2e)', () => {
  let connection: Connection;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    connection = moduleRef.get<Connection>(getConnectionToken());

    // Reproduce a fresh production database: schemas registered, nothing built.
    // `dropIndexes` leaves the mandatory `_id` index alone.
    for (const name of connection.modelNames()) {
      await connection
        .model(name)
        .collection.dropIndexes()
        .catch(() => undefined);
    }
  }, 120_000);

  afterAll(async () => {
    await connection?.close();
  });

  /**
   * Index descriptors on a collection.
   *
   * Returns `[]` when the collection does not exist. That is not defensive padding:
   * MongoDB creates a collection on first write, so a genuinely fresh production
   * database has none, and asking for its indexes fails with `ns does not exist`.
   * "The namespace is absent" and "it has no indexes" mean the same thing here.
   */
  async function indexesOf(
    modelName: string,
  ): Promise<Array<Record<string, unknown>>> {
    try {
      return (await connection.model(modelName).collection.indexes()) as Array<
        Record<string, unknown>
      >;
    } catch {
      return [];
    }
  }

  /** Index key patterns present on a collection, as comparable strings. */
  async function indexKeysOf(modelName: string): Promise<string[]> {
    return (await indexesOf(modelName)).map((index) =>
      JSON.stringify(index.key),
    );
  }

  /** Looks up one index by its key pattern. */
  async function indexByKey(
    modelName: string,
    key: Record<string, number>,
  ): Promise<Record<string, unknown> | undefined> {
    return (await indexesOf(modelName)).find(
      (index) => JSON.stringify(index.key) === JSON.stringify(key),
    );
  }

  it('starts without the unique constraints, as a fresh production database would', async () => {
    // Guards the test itself. If the drop silently failed, every assertion below
    // would pass whether or not the bootstrap step ran.
    expect(await indexKeysOf('User')).not.toContain(
      JSON.stringify({ email: 1 }),
    );
    expect(await indexKeysOf('RefreshToken')).not.toContain(
      JSON.stringify({ tokenHash: 1 }),
    );
  });

  it('creates them all when the bootstrap step runs', async () => {
    await syncDatabaseIndexes(connection);

    // A unique email is what makes "409 on duplicate registration" true. Without it
    // two accounts can share an address and login becomes ambiguous.
    const email = await indexByKey('User', { email: 1 });
    expect(email).toBeDefined();
    expect(email?.unique).toBe(true);

    // Part of the refresh-token security control, not a lookup optimisation: it makes
    // a double-insert impossible and turns reuse detection into an index scan.
    const tokenHash = await indexByKey('RefreshToken', { tokenHash: 1 });
    expect(tokenHash).toBeDefined();
    expect(tokenHash?.unique).toBe(true);

    // TTL. Without it expired tokens are never reaped and the collection grows
    // without bound.
    const ttl = await indexByKey('RefreshToken', { expiresAt: 1 });
    expect(ttl).toBeDefined();
    expect(ttl?.expireAfterSeconds).toBe(0);

    // Family revocation is an updateMany on the hot path of a security control;
    // unindexed it is a full collection scan.
    expect(
      await indexByKey('RefreshToken', { userId: 1, revokedAt: 1 }),
    ).toBeDefined();

    // The two task list queries.
    expect(
      await indexByKey('Task', {
        userId: 1,
        deletedAt: 1,
        status: 1,
        dueAt: 1,
      }),
    ).toBeDefined();
    expect(
      await indexByKey('Task', { userId: 1, deletedAt: 1, createdAt: -1 }),
    ).toBeDefined();
  });

  it('is safe to run twice', async () => {
    // It runs on every boot, so a redeploy must not fail on indexes that already
    // exist.
    await expect(syncDatabaseIndexes(connection)).resolves.toBeUndefined();

    const tokenHash = await indexByKey('RefreshToken', { tokenHash: 1 });
    expect(tokenHash?.unique).toBe(true);
  });
});
