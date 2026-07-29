import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

interface RequestContext {
  requestId: string;
}

const storage = new AsyncLocalStorage<RequestContext>();

/**
 * Returns the current request's id, or `'-'` outside a request (boot, shutdown hooks).
 */
export function getRequestId(): string {
  return storage.getStore()?.requestId ?? '-';
}

/**
 * Assigns every request a correlation id and makes it available anywhere downstream
 * without threading it through call signatures.
 *
 * This is why a 500 can safely say nothing useful to the client: the real cause is
 * logged against this id, and the client is handed the id. The user reports "request
 * 0f3c…", and that pins the exact log line — without the response ever having leaked
 * a stack trace or a database error.
 *
 * `AsyncLocalStorage` directly rather than a DI wrapper like `nestjs-cls`: it is ten
 * lines, has no dependency, and does the whole job here.
 */
export function requestContextMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  // Honour an upstream id if the caller supplied one, so a trace survives a proxy hop.
  const incoming = req.header('x-request-id');
  const requestId =
    incoming && incoming.length <= 128 ? incoming : randomUUID();

  res.setHeader('x-request-id', requestId);
  storage.run({ requestId }, () => next());
}
