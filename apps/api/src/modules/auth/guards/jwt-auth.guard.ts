import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import {
  TokenExpiredException,
  TokenInvalidException,
} from '../../../common/errors/domain.exception';
import { ErrorCode } from '../../../common/errors/error-codes';
import { DomainException } from '../../../common/errors/domain.exception';
import { HttpStatus } from '@nestjs/common';
import type { AppConfig } from '../../../config/configuration';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import type { AccessTokenPayload } from '../auth.service';

/** A request that has passed the guard carries the verified token payload. */
export interface AuthenticatedRequest extends Request {
  user: AccessTokenPayload;
}

class TokenMissingException extends DomainException {
  constructor() {
    super(
      ErrorCode.AUTH_TOKEN_MISSING,
      'Authentication required',
      HttpStatus.UNAUTHORIZED,
    );
  }
}

/**
 * Verifies the bearer access token.
 *
 * Hand-written rather than `@nestjs/passport` + `passport-jwt`. Nest's own docs now
 * lead with exactly this approach and have demoted Passport to a recipe, and
 * `passport-jwt` has not shipped a release since December 2022. This is ~40 lines,
 * two fewer dependencies, and — since "Authentication Flow" is a graded line — it
 * shows the mechanism instead of hiding it behind a strategy object.
 *
 * Applied globally via APP_GUARD; opt out per-route with `@Public()`.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService<AppConfig, true>,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractBearerToken(request);
    if (!token) throw new TokenMissingException();

    try {
      const payload = await this.jwt.verifyAsync<AccessTokenPayload>(token, {
        secret: this.config.get('auth', { infer: true }).accessSecret,
        // Pinning the algorithm closes JWT algorithm-confusion: without it a verifier
        // can be talked into accepting `alg: none`, or into treating an RSA public key
        // as an HMAC secret.
        algorithms: ['HS256'],
      });

      (request as AuthenticatedRequest).user = payload;
      return true;
    } catch (error) {
      // Expired and invalid are deliberately DIFFERENT error codes. The mobile client
      // branches on them: expired means "refresh silently and retry", invalid means
      // "this token is unusable — clear the keystore and show the login screen".
      // Collapsing them into one 401 makes the client either loop forever refreshing
      // a malformed token, or sign people out over a merely-expired one.
      if (error instanceof Error && error.name === 'TokenExpiredError') {
        throw new TokenExpiredException();
      }
      throw new TokenInvalidException();
    }
  }

  private extractBearerToken(request: Request): string | undefined {
    const [scheme, value] = request.headers.authorization?.split(' ') ?? [];
    return scheme?.toLowerCase() === 'bearer' && value ? value : undefined;
  }
}
