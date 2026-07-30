import { API_URL, REQUEST_TIMEOUT_MS } from '../config/env';
import { ErrorCode, TERMINAL_AUTH_CODES } from './types';

import type { AuthTokens, ErrorEnvelope } from './types';

/**
 * What happened when we tried to exchange a refresh token.
 *
 * Three outcomes, not two, and the third is the one that matters. Collapsing
 * "the server said no" together with "we could not reach the server" is what makes
 * an app sign people out because their train went into a tunnel — and it would
 * break the plan's own "force-quit → still logged in" demo beat the first time the
 * API is cold-starting.
 */
export type RefreshOutcome =
  /** New access token issued. The session continues. */
  | { kind: 'refreshed'; tokens: AuthTokens }
  /**
   * The server rejected the refresh token itself. The session is over: clear the
   * keystore and return to the auth stack. Retrying cannot help.
   */
  | { kind: 'rejected'; code: ErrorCode; message: string }
  /**
   * We never got a verdict — offline, timeout, 5xx, or rate-limited. The refresh
   * token may well still be valid, so the session is **kept** and the caller
   * retries later.
   */
  | { kind: 'unavailable'; message: string };

/** Narrows an unknown JSON body to the API's error envelope. */
function asErrorEnvelope(body: unknown): ErrorEnvelope | null {
  if (typeof body !== 'object' || body === null) {
    return null;
  }
  const candidate = body as Partial<ErrorEnvelope>;
  return typeof candidate.code === 'string' ? (body as ErrorEnvelope) : null;
}

/**
 * Exchanges a refresh token for a fresh access token.
 *
 * ## Why this uses `fetch` instead of RTK Query
 *
 * This request is the mechanism that *repairs* the transport, so routing it through
 * the transport is how you get infinite recursion: a 401 triggers a refresh, the
 * refresh goes through the wrapper, its own 401 triggers another refresh, and so on
 * until the stack gives out.
 *
 * The usual fix is a bypass flag threaded through the wrapper. A single plain
 * `fetch`, in one place, used by both callers that need it, is less machinery and
 * far easier to reason about — and it makes this function a pure token→outcome
 * mapping that tests can drive by stubbing `fetch`.
 *
 * It deliberately touches neither Redux nor the keystore. Callers decide what a
 * given outcome means; this only reports what the server said.
 *
 * @param refreshToken The opaque token from the keystore.
 * @param signal Optional abort signal, composed with the request timeout.
 * @returns A {@link RefreshOutcome}. Never throws for an expected failure.
 */
export async function refreshSession(
  refreshToken: string,
  signal?: AbortSignal,
): Promise<RefreshOutcome> {
  // `fetch` has no timeout of its own, so an unreachable host hangs until the OS
  // gives up — minutes, during which the splash would still be showing.
  const timeoutController = new AbortController();
  const timeoutId = setTimeout(
    () => timeoutController.abort(),
    REQUEST_TIMEOUT_MS,
  );

  const onExternalAbort = () => timeoutController.abort();
  signal?.addEventListener('abort', onExternalAbort);

  try {
    const response = await fetch(`${API_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // The refresh token travels in the body, and the endpoint is unauthenticated —
      // it is called precisely when the access token has expired, so requiring one
      // would make it unusable.
      body: JSON.stringify({ refreshToken }),
      signal: timeoutController.signal,
    });

    if (response.ok) {
      const tokens = (await response.json()) as AuthTokens;
      return { kind: 'refreshed', tokens };
    }

    // A 401/403 carrying a terminal auth code is a real verdict. Anything else —
    // 429, 5xx, an HTML error page from a proxy — is the server being unable to
    // answer, which must not end the session.
    const body: unknown = await response.json().catch(() => null);
    const envelope = asErrorEnvelope(body);

    if (envelope && TERMINAL_AUTH_CODES.includes(envelope.code)) {
      return {
        kind: 'rejected',
        code: envelope.code,
        message: envelope.message,
      };
    }

    // Credentials-invalid should not reach here, but if the contract ever shifts,
    // treating an explicit auth rejection as terminal is the safe reading.
    if (envelope?.code === ErrorCode.AUTH_CREDENTIALS_INVALID) {
      return {
        kind: 'rejected',
        code: envelope.code,
        message: envelope.message,
      };
    }

    return {
      kind: 'unavailable',
      message: envelope
        ? `${envelope.code} (HTTP ${response.status})`
        : `HTTP ${response.status}`,
    };
  } catch (error) {
    // Network failure, DNS failure, timeout, or abort. Explicitly *not* a rejection:
    // we have no evidence the token is bad.
    return {
      kind: 'unavailable',
      message:
        error instanceof Error ? error.message : 'Network request failed',
    };
  } finally {
    clearTimeout(timeoutId);
    signal?.removeEventListener('abort', onExternalAbort);
  }
}
