import { HttpException, HttpStatus } from '@nestjs/common';
import { ErrorCode, type ErrorCodeValue } from './error-codes';

/**
 * Base class for errors the application raises deliberately, as opposed to ones
 * thrown at it by a library.
 *
 * Carrying the `code` on the exception means the global filter never has to guess
 * an error's identity from its message text — which is the usual way error contracts
 * rot, because someone eventually reworded a string.
 */
export class DomainException extends HttpException {
  constructor(
    readonly code: ErrorCodeValue,
    message: string,
    status: HttpStatus,
  ) {
    super(message, status);
  }
}

/**
 * Raised by the body-parser error middleware in main.ts.
 *
 * Necessary because Nest rewrites body-parser's `SyntaxError` into a bare
 * `BadRequestException` and discards its `type` tag in the process — verified: by the
 * time the global filter sees it, `type` is gone from both the exception and its
 * `cause`. So the distinction has to be captured upstream, while the tag still exists,
 * or a malformed body is indistinguishable from an ordinary validation failure.
 */
export class MalformedJsonException extends DomainException {
  constructor() {
    super(
      ErrorCode.MALFORMED_JSON,
      'Request body is not valid JSON',
      HttpStatus.BAD_REQUEST,
    );
  }
}

export class PayloadTooLargeException extends DomainException {
  constructor() {
    super(
      ErrorCode.PAYLOAD_TOO_LARGE,
      'Request body is too large',
      HttpStatus.PAYLOAD_TOO_LARGE,
    );
  }
}

export class TaskNotFoundException extends DomainException {
  constructor() {
    // 404 rather than 403, deliberately, and the same response whether the task
    // belongs to someone else or does not exist at all. A 403 would confirm that a
    // given id is real, which leaks the existence of other users' data.
    super(ErrorCode.TASK_NOT_FOUND, 'Task not found', HttpStatus.NOT_FOUND);
  }
}

export class EmailAlreadyRegisteredException extends DomainException {
  constructor() {
    super(
      ErrorCode.EMAIL_ALREADY_REGISTERED,
      'An account with that email already exists',
      HttpStatus.CONFLICT,
    );
  }
}

export class InvalidCredentialsException extends DomainException {
  constructor() {
    // Intentionally identical for "no such user" and "wrong password" — anything
    // else turns the login endpoint into an account-enumeration oracle.
    super(
      ErrorCode.AUTH_CREDENTIALS_INVALID,
      'Invalid email or password',
      HttpStatus.UNAUTHORIZED,
    );
  }
}

export class TokenExpiredException extends DomainException {
  constructor() {
    super(
      ErrorCode.AUTH_TOKEN_EXPIRED,
      'Access token has expired',
      HttpStatus.UNAUTHORIZED,
    );
  }
}

export class TokenInvalidException extends DomainException {
  constructor(message = 'Token is invalid') {
    super(ErrorCode.AUTH_TOKEN_INVALID, message, HttpStatus.UNAUTHORIZED);
  }
}

export class RefreshTokenReusedException extends DomainException {
  constructor() {
    super(
      ErrorCode.AUTH_REFRESH_REUSED,
      'Refresh token was already used; the session has been revoked',
      HttpStatus.UNAUTHORIZED,
    );
  }
}
