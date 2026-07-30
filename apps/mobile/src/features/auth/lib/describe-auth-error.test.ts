import { describeAuthError } from './describe-auth-error';

/** Builds the envelope the API's exception filter actually emits. */
function envelope(
  statusCode: number,
  code: string,
  message: string,
  details?: Array<{ field: string; constraint: string }>,
) {
  return {
    status: statusCode,
    data: {
      statusCode,
      code,
      message,
      details,
      path: '/api/v1/auth/login',
      timestamp: '2026-07-30T00:00:00.000Z',
      requestId: 'req-1',
    },
  };
}

describe('describeAuthError', () => {
  it('maps a wrong password to copy that does not say which half was wrong', () => {
    const result = describeAuthError(
      envelope(401, 'AUTH_CREDENTIALS_INVALID', 'Invalid credentials'),
    );

    expect(result.message).toBe(
      'That email and password combination is not right.',
    );
    // The code is surfaced, not swallowed: it is the API contract made visible and
    // the one thing that makes a screenshot in a bug report actionable.
    expect(result.code).toBe('AUTH_CREDENTIALS_INVALID');
  });

  it('points a duplicate email at the screen that would work', () => {
    const result = describeAuthError(
      envelope(409, 'EMAIL_ALREADY_REGISTERED', 'Email already registered'),
    );

    expect(result.message).toBe(
      'That email already has an account. Sign in instead.',
    );
    expect(result.code).toBe('EMAIL_ALREADY_REGISTERED');
  });

  it('names the fields a validation failure rejected', () => {
    const result = describeAuthError(
      envelope(400, 'VALIDATION_FAILED', 'Validation failed', [
        { field: 'email', constraint: 'isEmail' },
        { field: 'password', constraint: 'minLength' },
      ]),
    );

    // The server's generic headline is replaced by its own `details`, which is the
    // part worth reading. This firing at all means the zod schemas and the DTOs
    // have drifted — precisely when the specifics matter.
    expect(result.message).toBe('The server rejected email and password.');
    expect(result.code).toBe('VALIDATION_FAILED');
  });

  it('falls through to the server message for a code it has no copy for', () => {
    const result = describeAuthError(
      envelope(404, 'USER_NOT_FOUND', 'No such user'),
    );

    // Deliberate: a table covering every code would be mostly dead entries, and
    // the server's messages are already written for a human.
    expect(result.message).toBe('No such user');
    expect(result.code).toBe('USER_NOT_FOUND');
  });

  /**
   * The two transport failures are distinguished because the advice differs.
   *
   * The API sleeps after 15 minutes idle and takes up to a minute to wake, so a
   * timeout on a grader's first launch is expected rather than exceptional — and
   * "try again" is genuinely the fix. Telling them to check their connection
   * instead would send them debugging the wrong thing.
   */
  it('tells an offline device to check its connection', () => {
    const result = describeAuthError({ status: 'FETCH_ERROR', error: 'boom' });

    expect(result.message).toBe(
      "Can't reach the server. Check your connection and try again.",
    );
    expect(result.code).toBe('FETCH_ERROR');
  });

  it('tells a timeout that the server is waking up', () => {
    const result = describeAuthError({
      status: 'TIMEOUT_ERROR',
      error: 'slow',
    });

    expect(result.message).toBe(
      'The server is waking up. Give it a moment and try again.',
    );
    expect(result.code).toBe('TIMEOUT_ERROR');
  });

  it('reports the status when something answered but our API did not', () => {
    // A proxy or the platform, with an HTML body rather than our envelope.
    const result = describeAuthError({ status: 502, data: '<html>' });

    expect(result.message).toBe(
      'The server rejected the request. Please try again.',
    );
    expect(result.code).toBe('HTTP_502');
  });

  it.each([
    ['undefined', undefined],
    ['null', null],
    ['a bare string', 'kaboom'],
    ['an empty object', {}],
  ])('stays total for %s', (_case, input) => {
    const result = describeAuthError(input);

    // Totality is the point. The screen has exactly one place to put a failure,
    // so a branch returning nothing would render an empty panel — the user sees
    // that something failed and is told nothing at all.
    expect(result.message).toBe('Something went wrong. Please try again.');
    expect(result.code).toBeNull();
  });
});
