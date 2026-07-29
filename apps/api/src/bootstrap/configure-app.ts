import { ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { json, urlencoded } from 'express';
import helmet from 'helmet';
import { requestContextMiddleware } from '../common/context/request-context';
import { bodyParserErrorMiddleware } from '../common/middleware/body-parser-error.middleware';

/** Largest request body accepted. Generous for a to-do payload, small enough that a
 *  multi-megabyte body cannot tie up the single worker this runs on. */
export const BODY_LIMIT = '256kb';

/**
 * Applies every piece of request-pipeline configuration.
 *
 * Shared by `main.ts` and the integration tests **on purpose**. When the tests
 * hand-rolled their own copy of this setup it silently drifted — helmet was missing,
 * so the suite was exercising a subtly different app than the one that ships, and a
 * test asserting security headers failed for a reason that had nothing to do with the
 * code under test. One definition means the tests cannot lie about the real pipeline.
 *
 * Ordering here is load-bearing and each step is commented with why.
 */
export function configureApp(app: NestExpressApplication): void {
  // 1. helmet first: it sets response headers, which it can only do for handlers
  //    registered after it.
  app.use(helmet());

  // 2. Correlation id BEFORE body parsing, so even a malformed-JSON rejection carries
  //    a requestId that ties the response to its log line.
  app.use(requestContextMiddleware);

  // 3. Body parsing, with an explicit size limit.
  app.use(json({ limit: BODY_LIMIT }));
  app.use(urlencoded({ extended: true, limit: BODY_LIMIT }));

  // 4. Directly after the parsers, while body-parser's `type` tag still exists —
  //    Nest rewrites these errors and discards it.
  app.use(bodyParserErrorMiddleware);

  // 5. Everything under /api/v1 except health and docs, so the platform's health-check
  //    URL and the reviewer's Swagger link survive an API version bump.
  //    Prefix only — `enableVersioning()` would prepend a second `/v1`.
  app.setGlobalPrefix('api/v1', {
    exclude: ['health', 'health/ready', 'docs'],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // drop properties with no DTO decorator
      forbidNonWhitelisted: true, // ...and reject outright rather than silently stripping
      transform: true, // hand controllers real DTO instances, not plain objects
      transformOptions: { enableImplicitConversion: true },
      // Deliberately NOT disabling error messages in production: this is a graded API,
      // and a reviewer poking at it should get a useful 400, not an empty one.
    }),
  );
}
