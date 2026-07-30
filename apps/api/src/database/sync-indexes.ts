import { Logger } from '@nestjs/common';
import type { Connection } from 'mongoose';

/**
 * Creates every index the schemas declare.
 *
 * ## Why this exists
 *
 * `database.module.ts` sets `autoIndex: false` in production — deliberately, so a
 * rolling restart never kicks off a surprise index build against live traffic. But
 * turning auto-indexing off only makes sense if something else creates the indexes,
 * and nothing did. The result was a production-only fault that no local test could
 * catch, because every test runs with `autoIndex` on:
 *
 * - **`users.email` unique** — absent, so two accounts could share an email and the
 *   409-on-duplicate behaviour silently stopped holding.
 * - **`refreshTokens.tokenHash` unique** — absent. This one is a security control,
 *   not a lookup optimisation: it is what makes a double-insert impossible and what
 *   turns reuse detection into an index scan rather than a collection scan.
 * - **`refreshTokens.expiresAt` TTL** — absent, so expired tokens were never reaped
 *   and the collection would grow without bound.
 * - the compound task indexes, so every list query was a full scan.
 *
 * ## Why `syncIndexes` and not `createIndexes`
 *
 * `syncIndexes` also *drops* indexes the schemas no longer declare, which is what
 * keeps the deployed database converging on the code rather than accumulating
 * whatever past versions happened to create. This application owns its database
 * outright, so there is nothing else's index to destroy. On collections this size
 * both are effectively instant.
 *
 * ## Why a failure here is logged rather than fatal
 *
 * A refusal to start would turn a transient Atlas hiccup into a hard outage, and the
 * app is still perfectly able to serve reads. But the missing guarantees are real, so
 * the failure is logged at error level and names what is now unenforced — silence
 * here is exactly the problem this function was written to fix.
 *
 * @param connection The Mongoose connection to synchronise.
 */
export async function syncDatabaseIndexes(
  connection: Connection,
): Promise<void> {
  const logger = new Logger('DatabaseIndexes');
  const modelNames = connection.modelNames();

  try {
    // Sequential rather than Promise.all: an M0 instance has a small connection
    // ceiling, and index builds are the last thing worth parallelising into it.
    for (const name of modelNames) {
      await connection.model(name).syncIndexes();
    }
    logger.log(`Indexes synchronised for: ${modelNames.join(', ')}`);
  } catch (error) {
    logger.error(
      'Index synchronisation FAILED. Unique email, unique refresh-token hash and ' +
        'the refresh-token TTL are not enforced until this succeeds.',
      error instanceof Error ? error.stack : String(error),
    );
  }
}
