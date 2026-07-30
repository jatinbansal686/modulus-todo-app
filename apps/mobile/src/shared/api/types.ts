/**
 * The API contract, hand-mirrored from `apps/api`.
 *
 * Written by hand rather than generated from the OpenAPI document: there are only a
 * handful of shapes, and a codegen step is a toolchain to debug for no gain at this
 * size. The trade-off — the API could change without TypeScript noticing — is real,
 * and the mitigation is that these mirror the server's own definitions closely
 * enough to diff by eye.
 *
 * @see apps/api/src/common/errors/error-codes.ts
 * @see apps/api/src/modules/auth/dto/auth.dto.ts
 */

/**
 * Machine-readable error codes. **Part of the contract, not decoration.**
 *
 * The re-auth wrapper branches on these, and it cannot work without them: a bare
 * 401 for every failure makes the client either loop forever refreshing a malformed
 * token, or sign users out over one that had merely expired.
 */
export const ErrorCode = {
  // Validation / request shape
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  MALFORMED_JSON: 'MALFORMED_JSON',
  PAYLOAD_TOO_LARGE: 'PAYLOAD_TOO_LARGE',
  INVALID_ID: 'INVALID_ID',

  // Auth
  AUTH_CREDENTIALS_INVALID: 'AUTH_CREDENTIALS_INVALID',
  AUTH_TOKEN_MISSING: 'AUTH_TOKEN_MISSING',
  AUTH_TOKEN_EXPIRED: 'AUTH_TOKEN_EXPIRED',
  AUTH_TOKEN_INVALID: 'AUTH_TOKEN_INVALID',
  AUTH_REFRESH_REUSED: 'AUTH_REFRESH_REUSED',
  EMAIL_ALREADY_REGISTERED: 'EMAIL_ALREADY_REGISTERED',

  // Resources
  TASK_NOT_FOUND: 'TASK_NOT_FOUND',
  USER_NOT_FOUND: 'USER_NOT_FOUND',
  DUPLICATE_RESOURCE: 'DUPLICATE_RESOURCE',

  // Infrastructure
  NOT_FOUND: 'NOT_FOUND',
  RATE_LIMITED: 'RATE_LIMITED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

/** A single error code value. */
export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

/**
 * A 401 that means "this access token was fine, it just aged out".
 *
 * The only two codes for which refreshing and retrying is the correct response.
 * `AUTH_TOKEN_MISSING` is included because it is what the server returns during the
 * optimistic-bootstrap window, when the app is rendering as signed in but the
 * in-memory access token has not arrived yet — also repairable by a refresh.
 */
export const RECOVERABLE_AUTH_CODES: readonly ErrorCode[] = [
  ErrorCode.AUTH_TOKEN_EXPIRED,
  ErrorCode.AUTH_TOKEN_MISSING,
];

/**
 * A 401 that means "stop; this session is over".
 *
 * Clear the keystore and return to the auth stack. Retrying cannot help, and
 * retrying forever is the failure mode this distinction exists to prevent.
 */
export const TERMINAL_AUTH_CODES: readonly ErrorCode[] = [
  ErrorCode.AUTH_TOKEN_INVALID,
  ErrorCode.AUTH_REFRESH_REUSED,
];

/** The single error shape every failed request returns. */
export interface ErrorEnvelope {
  statusCode: number;
  code: ErrorCode;
  message: string;
  /** Field-level detail, present only for validation failures. */
  details?: Array<{ field: string; constraint: string }>;
  path: string;
  timestamp: string;
  /** Correlates this response with the server log line that recorded the cause. */
  requestId: string;
}

/** The user fields the API exposes. Never includes the password hash. */
export interface PublicUser {
  id: string;
  email: string;
  displayName?: string;
}

/** Response body for register, login and refresh. */
export interface AuthTokens {
  /** JWT, 15-minute lifetime. Held in memory only. */
  accessToken: string;
  /**
   * Opaque 64-byte random value — **not** a JWT. Goes to the device keystore and
   * never into Redux.
   *
   * `POST /auth/refresh` echoes the *same* value back rather than issuing a new
   * one (rotation is deferred), so the client must not rewrite the keystore on
   * every refresh.
   */
  refreshToken: string;
  /**
   * Absolute expiry of the access token, ISO 8601.
   *
   * The server sends this so the client can refresh *proactively* instead of
   * waiting for a 401 — and so it can do that without a JWT-decoding dependency.
   */
  accessTokenExpiresAt: string;
  user: PublicUser;
}

/** Credentials for `POST /auth/login`. */
export interface LoginRequest {
  email: string;
  password: string;
}

/** Registration payload. `displayName` is optional and collected at sign-up. */
export interface RegisterRequest {
  email: string;
  password: string;
  displayName?: string;
}

/**
 * List envelope. Single resources are returned bare, without a wrapper.
 *
 * @template T The element type.
 */
export interface Paginated<T> {
  data: T[];
  meta: {
    total: number;
    page: number;
    limit: number;
    hasMore: boolean;
  };
}
