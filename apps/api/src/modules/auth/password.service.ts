import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import type { AppConfig } from '../../config/configuration';

/**
 * Password hashing.
 *
 * Argon2id at OWASP's documented minimum: 19 MiB of memory, 2 iterations, 1 degree
 * of parallelism. bcrypt is explicitly "legacy systems only" in the current cheat
 * sheet, and its silent 72-byte truncation is a real correctness bug — two long
 * passwords sharing a 72-byte prefix authenticate interchangeably.
 *
 * ## The cost, stated honestly
 *
 * These parameters are kept in production even on a 0.1-CPU free tier. A hash needs
 * roughly 40-50ms of a full core; under a 10% CPU quota that becomes several hundred
 * milliseconds of wall clock, so login feels slow on the hosted demo.
 *
 * That is a deliberate trade. Weakening the KDF to make a free tier feel snappier is
 * the wrong direction, and the README says so rather than hiding it.
 *
 * Memory is NOT the constraint people expect: argon2 is an N-API addon whose hashing
 * runs on libuv's threadpool, capped at UV_THREADPOOL_SIZE (default 4). Peak usage is
 * ~4 x 19 MiB ≈ 76 MiB, comfortably inside a 512 MB instance. Raising
 * UV_THREADPOOL_SIZE is how you would manufacture an OOM that does not currently exist.
 */
@Injectable()
export class PasswordService {
  /** OWASP Password Storage Cheat Sheet minimums for Argon2id. */
  private static readonly OPTIONS = {
    type: argon2.argon2id,
    memoryCost: 19456, // 19 MiB, in KiB
    timeCost: 2,
    parallelism: 1,
  } as const;

  private readonly pepper: Buffer;

  constructor(config: ConfigService<AppConfig, true>) {
    // argon2's native `secret` option — a pepper mixed into the hash itself, so a
    // leaked database alone cannot be attacked offline without also leaking the
    // environment.
    //
    // Rotation is lazy, and that is inherent rather than a shortcut: OWASP states
    // plainly that "peppers cannot be changed without knowledge of a user's password".
    // Re-keying requires the plaintext, so a changed pepper takes effect per user at
    // their next successful login. (A post-hash HMAC does not avoid this — HMAC is
    // one-way too. Only *encrypting* the hash would be bulk-rotatable.)
    this.pepper = Buffer.from(
      config.get('auth', { infer: true }).passwordPepper,
      'utf8',
    );
  }

  async hash(plaintext: string): Promise<string> {
    return argon2.hash(plaintext, {
      ...PasswordService.OPTIONS,
      secret: this.pepper,
    });
  }

  /**
   * Verifies a password.
   *
   * Returns false rather than throwing on a malformed stored hash: a corrupt record
   * should read as "wrong password", not leak a 500 that confirms the account exists.
   */
  async verify(hash: string, plaintext: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, plaintext, { secret: this.pepper });
    } catch {
      return false;
    }
  }
}
