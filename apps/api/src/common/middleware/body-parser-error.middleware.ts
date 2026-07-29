import type { NextFunction, Request, Response } from 'express';
import {
  MalformedJsonException,
  PayloadTooLargeException,
} from '../errors/domain.exception';

/**
 * Translates body-parser failures into domain exceptions.
 *
 * Registered as an Express *error* middleware (four arguments) immediately after the
 * body parsers, so it runs before Nest's exception layer.
 *
 * Why it has to happen here rather than in the global filter: Nest rewrites
 * body-parser's `SyntaxError` into a plain `BadRequestException` and drops its `type`
 * tag while doing so. Verified by instrumenting the filter — it receives
 * `BadRequestException` with own keys `stack,response,status,options,message,name`,
 * and `type` is absent from both the exception and its `cause`. Once the tag is gone
 * the information is unrecoverable, so it is captured here while it still exists.
 *
 * Without this, a client typo in a JSON body is reported as `VALIDATION_FAILED`,
 * which sends the mobile app looking for a field-level problem that does not exist.
 */
export function bodyParserErrorMiddleware(
  err: unknown,
  _req: Request,
  _res: Response,
  next: NextFunction,
): void {
  const type = (err as { type?: unknown } | null)?.type;

  if (type === 'entity.parse.failed') {
    next(new MalformedJsonException());
    return;
  }
  if (type === 'entity.too.large') {
    next(new PayloadTooLargeException());
    return;
  }

  next(err);
}
