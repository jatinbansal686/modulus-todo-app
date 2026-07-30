import { ErrorCode } from '@shared/api/types';

import type { ErrorEnvelope } from '@shared/api/types';

/**
 * A failure, rendered for a human without discarding what it was.
 *
 * Both halves are shown. The sentence is what the user acts on; the `code` is what
 * makes a bug report actionable and is the API contract made visible — the brief
 * asks for validation errors to surface the server's own code rather than being
 * flattened into "Something went wrong".
 */
export interface DisplayableError {
  /** One plain sentence, addressed to the person looking at the screen. */
  message: string;
  /** The API's machine-readable code, or a transport pseudo-code. `null` if unknown. */
  code: string | null;
}

/**
 * Copy for the codes the auth screens can actually provoke.
 *
 * Only these. A table covering every code in the enum would be mostly dead entries
 * asserting things this screen cannot cause, and each one is a chance to drift.
 * Anything absent falls through to the server's own `message`, which is already
 * written for a human.
 */
const MESSAGES: Partial<Record<ErrorCode, string>> = {
  [ErrorCode.AUTH_CREDENTIALS_INVALID]:
    'That email and password combination is not right.',
  [ErrorCode.EMAIL_ALREADY_REGISTERED]:
    'That email already has an account. Sign in instead.',
  [ErrorCode.RATE_LIMITED]:
    'Too many attempts. Wait a minute before trying again.',
  [ErrorCode.INTERNAL_ERROR]:
    'The server had a problem. Please try again in a moment.',
};

/** Whether `value` is the API's error envelope rather than some other JSON body. */
function isErrorEnvelope(value: unknown): value is ErrorEnvelope {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as ErrorEnvelope).code === 'string'
  );
}

/**
 * Renders the field-level detail a `VALIDATION_FAILED` response carries.
 *
 * The server sends `details: [{ field, constraint }]`, which is far more useful
 * than the generic "Validation failed" headline sitting above it. This should
 * rarely fire — the zod schemas mirror the DTOs — and when it does, it means the
 * two have drifted, which is exactly when the specifics are worth reading.
 */
function describeValidationFailure(envelope: ErrorEnvelope): string {
  const fields = envelope.details?.map((detail) => detail.field) ?? [];
  if (fields.length === 0) {
    return envelope.message;
  }
  return `The server rejected ${fields.join(' and ')}.`;
}

/**
 * Turns anything a mutation can reject with into something worth showing.
 *
 * Deliberately total: it takes `unknown` and always returns a message. An auth
 * screen has exactly one place to put a failure, and a branch that fell through to
 * `undefined` would render an empty error panel — the worst of both outcomes, since
 * the user sees that something failed and is told nothing about it.
 *
 * @param error The `error` from an RTK Query mutation result.
 * @returns A sentence to show, plus the code behind it where one exists.
 */
export function describeAuthError(error: unknown): DisplayableError {
  if (typeof error !== 'object' || error === null) {
    return { message: 'Something went wrong. Please try again.', code: null };
  }

  const { status, data } = error as { status?: unknown; data?: unknown };

  // Transport failures never reach the server, so they have no envelope and no
  // code of their own. They are also the two most likely failures in this app:
  // the API is on a free instance that sleeps after 15 minutes.
  if (status === 'FETCH_ERROR') {
    return {
      message: "Can't reach the server. Check your connection and try again.",
      code: 'FETCH_ERROR',
    };
  }
  if (status === 'TIMEOUT_ERROR') {
    return {
      // Not a generic timeout message: the hosted API sleeps when idle and takes
      // up to a minute to wake. Telling the user to simply retry is both true and
      // the single most useful instruction here — the second attempt usually works.
      message: 'The server is waking up. Give it a moment and try again.',
      code: 'TIMEOUT_ERROR',
    };
  }
  if (status === 'PARSING_ERROR') {
    return {
      message: 'The server sent something unexpected. Please try again.',
      code: 'PARSING_ERROR',
    };
  }

  if (isErrorEnvelope(data)) {
    if (data.code === ErrorCode.VALIDATION_FAILED) {
      return { message: describeValidationFailure(data), code: data.code };
    }
    return { message: MESSAGES[data.code] ?? data.message, code: data.code };
  }

  // A numeric status with no envelope: a proxy or the platform answered, not our
  // API. Worth showing the number, since it is the only fact available.
  if (typeof status === 'number') {
    return {
      message: 'The server rejected the request. Please try again.',
      code: `HTTP_${String(status)}`,
    };
  }

  return { message: 'Something went wrong. Please try again.', code: null };
}
