import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'node:crypto';
import { Types } from 'mongoose';
import type { AppConfig } from '../../config/configuration';
import {
  EmailAlreadyRegisteredException,
  InvalidCredentialsException,
  TokenInvalidException,
} from '../../common/errors/domain.exception';
import { UsersRepository } from '../users/users.repository';
import type { UserDocument } from '../users/schemas/user.schema';
import type { AuthTokensDto, LoginDto, RegisterDto } from './dto/auth.dto';
import { PasswordService } from './password.service';
import { RefreshTokenService } from './refresh-token.service';

/** Claims carried by the access token. */
export interface AccessTokenPayload {
  sub: string;
  email: string;
  jti: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersRepository,
    private readonly passwords: PasswordService,
    private readonly refreshTokens: RefreshTokenService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  /**
   * Registers an account and signs the user straight in.
   *
   * Returning tokens rather than bouncing to a login screen removes a whole
   * transition — and a whole failure mode — from the client's happy path.
   */
  async register(dto: RegisterDto, userAgent?: string): Promise<AuthTokensDto> {
    const existing = await this.users.findByEmail(dto.email);
    if (existing) throw new EmailAlreadyRegisteredException();

    const passwordHash = await this.passwords.hash(dto.password);

    // The unique index on `email` is the real guard: two simultaneous registrations
    // both pass the check above, and exactly one survives the insert. Mongo's
    // duplicate-key error is mapped to 409 by the global filter, so the loser gets
    // the same answer as a sequential duplicate rather than a 500.
    const user = await this.users.create(
      dto.email,
      passwordHash,
      dto.displayName,
    );

    return this.issueTokens(user, { userAgent });
  }

  async login(dto: LoginDto, userAgent?: string): Promise<AuthTokensDto> {
    const user = await this.users.findByEmailWithPassword(dto.email);

    // Identical exception for "no such account" and "wrong password". Anything that
    // distinguishes them turns this endpoint into an account-enumeration oracle.
    //
    // Note the timing asymmetry that remains: a missing account skips the Argon2
    // verify and answers faster. Closing that fully means hashing against a dummy
    // hash on the miss path; called out here as a known, accepted gap rather than
    // left unnoticed.
    if (!user) throw new InvalidCredentialsException();

    const valid = await this.passwords.verify(user.passwordHash, dto.password);
    if (!valid) throw new InvalidCredentialsException();

    return this.issueTokens(user, { userAgent });
  }

  /**
   * Exchanges a refresh token for a fresh access token.
   *
   * The same refresh token is returned unchanged: rotation is a later milestone. This
   * is stated explicitly because it matters to the client — knowing the value cannot
   * change means it never needs to rewrite the device keystore on a refresh, which
   * removes the write that rotation would otherwise make failure-prone.
   */
  // No `userAgent` parameter: without rotation this issues no new refresh token, so
  // there is no session record to stamp it on. It returns when rotation lands.
  async refresh(refreshToken: string): Promise<AuthTokensDto> {
    const stored = await this.refreshTokens.findActive(refreshToken);
    if (!stored)
      throw new TokenInvalidException('Refresh token is invalid or expired');

    const user = await this.users.findById(stored.userId);
    if (!user)
      throw new TokenInvalidException('Refresh token is invalid or expired');

    const { accessToken, accessTokenExpiresAt } =
      await this.signAccessToken(user);

    return {
      accessToken,
      refreshToken,
      accessTokenExpiresAt,
      user: this.publicUser(user),
    };
  }

  /** Revokes one session. Idempotent — logging out twice is not an error. */
  async logout(refreshToken: string): Promise<void> {
    await this.refreshTokens.revoke(refreshToken);
  }

  /** Revokes every active session for the user ("sign out everywhere"). */
  async logoutAll(userId: string): Promise<number> {
    return this.refreshTokens.revokeAllForUser(new Types.ObjectId(userId));
  }

  private async issueTokens(
    user: UserDocument,
    options: { userAgent?: string },
  ): Promise<AuthTokensDto> {
    const { accessToken, accessTokenExpiresAt } =
      await this.signAccessToken(user);
    const refresh = await this.refreshTokens.issue(user._id, {
      userAgent: options.userAgent,
    });

    return {
      accessToken,
      refreshToken: refresh.token,
      accessTokenExpiresAt,
      user: this.publicUser(user),
    };
  }

  private async signAccessToken(
    user: UserDocument,
  ): Promise<{ accessToken: string; accessTokenExpiresAt: string }> {
    const auth = this.config.get('auth', { infer: true });
    const payload: AccessTokenPayload = {
      sub: user._id.toString(),
      email: user.email,
      jti: randomUUID(),
    };

    const accessToken = await this.jwt.signAsync(payload, {
      secret: auth.accessSecret,
      expiresIn: auth.accessTtl,
      algorithm: 'HS256',
    });

    // Read the expiry back off the signed token rather than recomputing it from the
    // TTL string — that way the value handed to the client is exactly what the
    // verifier will enforce, with no chance of the two drifting.
    const decoded = this.jwt.decode<{ exp: number }>(accessToken);

    return {
      accessToken,
      accessTokenExpiresAt: new Date(decoded.exp * 1000).toISOString(),
    };
  }

  private publicUser(user: UserDocument): AuthTokensDto['user'] {
    return {
      id: user._id.toString(),
      email: user.email,
      ...(user.displayName ? { displayName: user.displayName } : {}),
    };
  }
}
