import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { AuthenticatedRequest } from '../guards/jwt-auth.guard';
import type { AccessTokenPayload } from '../auth.service';

/**
 * Injects the verified token payload, or one field of it.
 *
 *     findAll(@CurrentUser('sub') userId: string)
 *
 * Reading the owner from the *token* rather than from a request parameter is what
 * makes horizontal access control hard to get wrong: there is no user id in the URL
 * or body for a caller to tamper with.
 */
export const CurrentUser = createParamDecorator(
  (field: keyof AccessTokenPayload | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    return field ? request.user[field] : request.user;
  },
);
