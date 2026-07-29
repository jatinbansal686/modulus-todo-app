import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { Model, Types } from 'mongoose';
import type { AppConfig } from '../../config/configuration';
import {
  RefreshToken,
  RefreshTokenDocument,
} from './schemas/refresh-token.schema';

export interface IssuedRefreshToken {
  token: string;
  familyId: string;
  expiresAt: Date;
}

/**
 * Issues, verifies and revokes refresh tokens.
 *
 * Tokens are opaque random strings rather than JWTs. A JWT would be self-describing
 * and — more importantly — self-validating, which makes server-side revocation
 * awkward: you cannot un-issue a signature. An opaque token means every refresh is a
 * database lookup, and "revoked" is simply a field.
 */
@Injectable()
export class RefreshTokenService {
  private readonly pepper: string;
  private readonly ttlDays: number;

  constructor(
    @InjectModel(RefreshToken.name)
    private readonly model: Model<RefreshTokenDocument>,
    config: ConfigService<AppConfig, true>,
  ) {
    const auth = config.get('auth', { infer: true });
    this.pepper = auth.refreshPepper;
    this.ttlDays = auth.refreshTtlDays;
  }

  /**
   * HMAC rather than a plain hash so that an attacker holding a dump of the
   * `refresh_tokens` collection still cannot recognise a token they have stolen
   * elsewhere without also holding the pepper.
   */
  private hash(token: string): string {
    return createHmac('sha256', this.pepper).update(token).digest('hex');
  }

  /** 64 bytes of CSPRNG output, base64url so it is safe in headers and JSON. */
  private generate(): string {
    return randomBytes(64).toString('base64url');
  }

  async issue(
    userId: Types.ObjectId,
    options: { familyId?: string; userAgent?: string } = {},
  ): Promise<IssuedRefreshToken> {
    const token = this.generate();
    const familyId = options.familyId ?? randomUUID();
    const expiresAt = new Date(Date.now() + this.ttlDays * 24 * 60 * 60 * 1000);

    await this.model.create({
      userId,
      tokenHash: this.hash(token),
      familyId,
      expiresAt,
      userAgent: options.userAgent?.slice(0, 256),
      revokedAt: null,
      replacedByTokenHash: null,
    });

    return { token, familyId, expiresAt };
  }

  /**
   * Looks up a live (unrevoked, unexpired) token.
   *
   * Returns null for "no such token", "already revoked" and "expired" alike — the
   * caller turns all three into the same 401, so a probe cannot distinguish a token
   * that never existed from one that did.
   */
  async findActive(token: string): Promise<RefreshTokenDocument | null> {
    return this.model
      .findOne({
        tokenHash: this.hash(token),
        revokedAt: null,
        expiresAt: { $gt: new Date() },
      })
      .exec();
  }

  /** Revokes a single session — what `POST /auth/logout` does. */
  async revoke(token: string): Promise<boolean> {
    const result = await this.model
      .updateOne(
        { tokenHash: this.hash(token), revokedAt: null },
        { $set: { revokedAt: new Date() } },
      )
      .exec();
    return result.modifiedCount > 0;
  }

  /**
   * Revokes every active session for a user — what `POST /auth/logout-all` does.
   *
   * Keyed on `userId`, NOT on `familyId`. A family is one login session, so revoking
   * the family would log out exactly one device and be indistinguishable from a plain
   * logout, despite the name promising otherwise.
   */
  async revokeAllForUser(userId: Types.ObjectId): Promise<number> {
    const result = await this.model
      .updateMany(
        { userId, revokedAt: null },
        { $set: { revokedAt: new Date() } },
      )
      .exec();
    return result.modifiedCount;
  }

  /** Revokes an entire login-session family. Used by theft detection (later milestone). */
  async revokeFamily(familyId: string): Promise<number> {
    const result = await this.model
      .updateMany(
        { familyId, revokedAt: null },
        { $set: { revokedAt: new Date() } },
      )
      .exec();
    return result.modifiedCount;
  }
}
