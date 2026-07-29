import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type RefreshTokenDocument = HydratedDocument<RefreshToken>;

/**
 * A refresh-token session.
 *
 * The token itself is never stored — only an HMAC of it. A database leak therefore
 * yields no usable tokens, because reproducing the HMAC also requires the pepper,
 * which lives in the environment rather than the database.
 *
 * HMAC-SHA256 rather than Argon2 here on purpose: the token is 64 bytes of CSPRNG
 * output, so there is no low-entropy secret to slow down a brute force against. A
 * deliberately slow KDF would only add latency to every refresh for no security gain.
 * (Passwords are the opposite case, and do get Argon2id.)
 */
@Schema({ timestamps: true, collection: 'refresh_tokens' })
export class RefreshToken {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId!: Types.ObjectId;

  /**
   * HMAC-SHA256(token, pepper). Unique so the same token can never be inserted
   * twice, and so the reuse lookup is an index scan rather than a collection scan.
   */
  @Prop({ required: true, unique: true })
  tokenHash!: string;

  /**
   * Groups every token descended from one login. Per-login-session, deliberately NOT
   * per-user: if a session is ever found to be compromised, revoking the family logs
   * out that one device rather than every device the person owns.
   *
   * Indexed because family revocation is an `updateMany({ familyId })` on the hot
   * path of a security control — unindexed, that is a full collection scan.
   */
  @Prop({ required: true, index: true })
  familyId!: string;

  /**
   * Set when this token is rotated out. Kept (rather than deleted) so a presented
   * token can be recognised as "used" instead of merely "unknown" — that distinction
   * is what makes theft detectable.
   *
   * Rotation itself is a later milestone; this field exists now so the schema does
   * not have to change underneath a live database later.
   */
  @Prop({ type: String, default: null })
  replacedByTokenHash!: string | null;

  @Prop({ type: Date, default: null })
  revokedAt!: Date | null;

  /**
   * TTL index: MongoDB deletes the document once this passes, so expired sessions
   * clean themselves up instead of accumulating forever.
   */
  @Prop({ required: true })
  expiresAt!: Date;

  @Prop({ maxlength: 256 })
  userAgent?: string;

  createdAt!: Date;
  updatedAt!: Date;
}

export const RefreshTokenSchema = SchemaFactory.createForClass(RefreshToken);

// expireAfterSeconds: 0 means "expire exactly at the time in this field".
RefreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Supports "revoke every active session for this user" (logout-all).
RefreshTokenSchema.index({ userId: 1, revokedAt: 1 });
