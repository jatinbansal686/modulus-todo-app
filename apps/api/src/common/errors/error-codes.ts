/**
 * Stable, machine-readable error codes.
 *
 * These are part of the API contract: the mobile client branches on them, so they
 * must not change casually. In particular the client's 401 handling *depends* on
 * being able to tell these apart —
 *
 *   AUTH_TOKEN_EXPIRED  -> refresh silently and retry the request
 *   AUTH_TOKEN_INVALID  -> the token is not salvageable; clear the keystore and
 *   AUTH_REFRESH_REUSED    send the user back to the login screen
 *
 * If every 401 looked the same, the client would either loop forever refreshing a
 * malformed token, or sign people out over a merely-expired one.
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

export type ErrorCodeValue = (typeof ErrorCode)[keyof typeof ErrorCode];

/** The single error shape every failed request returns. */
export interface ErrorEnvelope {
  statusCode: number;
  code: ErrorCodeValue;
  message: string;
  /** Field-level detail, present only for validation failures. */
  details?: Array<{ field: string; constraint: string }>;
  path: string;
  timestamp: string;
  /** Correlates this response with the server log line that recorded the cause. */
  requestId: string;
}
