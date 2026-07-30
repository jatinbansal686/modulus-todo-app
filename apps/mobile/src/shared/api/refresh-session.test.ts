import { refreshSession } from './refresh-session';
import {
  errorResponse,
  jsonResponse,
  stubFetch,
} from '@shared/test/fetch-stub';

import type { FetchStub } from '@shared/test/fetch-stub';

const TOKENS = {
  accessToken: 'new-access-token',
  refreshToken: 'same-refresh-token',
  accessTokenExpiresAt: '2026-07-30T01:00:00.000Z',
  user: { id: 'u1', email: 'demo@modulusseventeen.com' },
};

describe('refreshSession', () => {
  let stub: FetchStub;

  afterEach(() => {
    stub.restore();
  });

  it('returns the new tokens on success', async () => {
    stub = stubFetch(() => jsonResponse(200, TOKENS));

    const outcome = await refreshSession('stored-refresh-token');

    expect(outcome).toEqual({ kind: 'refreshed', tokens: TOKENS });
  });

  it('sends the refresh token in the body, not a header', async () => {
    // The endpoint is unauthenticated by design — it is called precisely when the
    // access token has expired, so a bearer header would make it unusable.
    stub = stubFetch(() => jsonResponse(200, TOKENS));

    await refreshSession('stored-refresh-token');

    const [call] = stub.callsTo('/auth/refresh');
    expect(call.method).toBe('POST');
    expect(call.body).toEqual({ refreshToken: 'stored-refresh-token' });
  });

  describe('rejects the session only when the server actually says so', () => {
    it.each(['AUTH_TOKEN_INVALID', 'AUTH_REFRESH_REUSED'])(
      'treats %s as terminal',
      async (code) => {
        stub = stubFetch(() => errorResponse(401, code, 'Token is invalid'));

        const outcome = await refreshSession('stale-token');

        expect(outcome).toEqual({
          kind: 'rejected',
          code,
          message: 'Token is invalid',
        });
      },
    );
  });

  describe('keeps the session when there is no verdict', () => {
    // Every case here is a server or network problem, not a statement about the
    // token. Signing the user out for any of them is the bug this distinction
    // exists to prevent — it would sign people out for entering a tunnel, and it
    // would break "force-quit → still signed in" against a cold API.

    it('treats a network failure as unavailable', async () => {
      stub = stubFetch(() => {
        throw new TypeError('Network request failed');
      });

      const outcome = await refreshSession('good-token');

      expect(outcome.kind).toBe('unavailable');
    });

    it('treats rate limiting as unavailable', async () => {
      stub = stubFetch(() => errorResponse(429, 'RATE_LIMITED'));

      const outcome = await refreshSession('good-token');

      expect(outcome.kind).toBe('unavailable');
    });

    it('treats a 5xx as unavailable', async () => {
      stub = stubFetch(() => errorResponse(503, 'INTERNAL_ERROR'));

      const outcome = await refreshSession('good-token');

      expect(outcome.kind).toBe('unavailable');
    });

    it('treats a non-JSON error body as unavailable', async () => {
      // A proxy or load balancer returning an HTML error page. There is no envelope
      // to read, so there is no evidence the token is bad.
      stub = stubFetch(
        () => new Response('<html>502 Bad Gateway</html>', { status: 502 }),
      );

      const outcome = await refreshSession('good-token');

      expect(outcome.kind).toBe('unavailable');
    });
  });

  it('aborts when the caller signals', async () => {
    const controller = new AbortController();
    // Never settles on its own: the only way out is the abort, which the stub
    // honours the way real `fetch` does.
    stub = stubFetch(() => new Promise<Response>(() => {}));

    const pending = refreshSession('good-token', controller.signal);
    controller.abort();

    // An abort is not a rejection of the token — it is us giving up. The session
    // must survive, or backgrounding the app mid-bootstrap would sign the user out.
    await expect(pending).resolves.toMatchObject({ kind: 'unavailable' });
  });
});
