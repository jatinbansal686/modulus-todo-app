import React from 'react';
import {
  fireEvent,
  screen,
  userEvent,
  waitFor,
} from '@testing-library/react-native';

import { createMemorySecretStore } from '@shared/lib/keychain/memory-secret-store';
import { createTestStore } from '@shared/test/create-test-store';
import {
  errorResponse,
  jsonResponse,
  stubFetch,
} from '@shared/test/fetch-stub';
import { renderWithProviders } from '@shared/test/render-with-providers';
import { RegisterScreen } from './register-screen';

import type { SecretStore } from '@shared/lib/keychain/types';
import type { FetchStub } from '@shared/test/fetch-stub';

/** Registration returns the same token pair as login — that is what auto-signs-in. */
const TOKENS = {
  accessToken: 'new-access-token',
  refreshToken: 'new-refresh-token',
  accessTokenExpiresAt: '2026-07-30T01:00:00.000Z',
  user: { id: 'u2', email: 'new@modulusseventeen.com' },
};

const EMAIL = 'new@modulusseventeen.com';
const PASSWORD = 'at-least-eight';

let stub: FetchStub;

afterEach(() => {
  stub.restore();
});

async function renderRegister(
  secretStore: SecretStore = createMemorySecretStore(),
) {
  const store = createTestStore({ secretStore });
  const navigate = jest.fn();

  const view = await renderWithProviders(
    <RegisterScreen navigation={{ navigate }} />,
    { store },
  );

  return { ...view, navigate, secretStore };
}

/** Fills the form. Pass `displayName: null` to leave the optional field untouched. */
async function fillForm({
  email = EMAIL,
  password = PASSWORD,
  displayName = null,
}: {
  email?: string;
  password?: string;
  displayName?: string | null;
} = {}) {
  await fireEvent.changeText(screen.getByLabelText('Email'), email);
  await fireEvent.changeText(screen.getByLabelText('Password'), password);
  if (displayName !== null) {
    await fireEvent.changeText(
      screen.getByLabelText('Display name (optional)'),
      displayName,
    );
  }
}

async function submit() {
  const user = userEvent.setup();
  await user.press(screen.getByRole('button', { name: 'Create account' }));
}

/** The parsed body of the single registration request. */
function registerBody() {
  const [call] = stub.callsTo('/auth/register');
  return call.body as Record<string, unknown>;
}

describe('RegisterScreen', () => {
  it('creates the account and signs straight in', async () => {
    stub = stubFetch(() => jsonResponse(201, TOKENS));
    const secretStore = createMemorySecretStore();
    const { store } = await renderRegister(secretStore);

    await fillForm({ displayName: 'Jatin' });
    await submit();

    await waitFor(() => {
      expect(store.getState().auth.status).toBe('authenticated');
    });

    // The whole point of registering returning tokens: there is no "account
    // created, now please sign in" step to fail at, and no state where the account
    // exists but its owner is looking at a login form wondering whether it worked.
    const [call] = stub.callsTo('/auth/register');
    expect(call.method).toBe('POST');
    expect(registerBody()).toEqual({
      email: EMAIL,
      password: PASSWORD,
      displayName: 'Jatin',
    });

    await expect(secretStore.getRefreshToken()).resolves.toBe(
      TOKENS.refreshToken,
    );
    expect(store.getState().auth.accessToken).toBe(TOKENS.accessToken);
  });

  /**
   * The blank-optional-field case, end to end.
   *
   * The schema test proves the transform; this proves it survives react-hook-form
   * and reaches the wire. The two are not the same claim — the resolver could
   * hand `handleSubmit` the *raw* values instead of the parsed ones, and the
   * schema test would still pass while the API received `displayName: ""`.
   */
  it('omits an untouched display name from the request entirely', async () => {
    stub = stubFetch(() => jsonResponse(201, TOKENS));
    await renderRegister();

    await fillForm();
    await submit();

    await waitFor(() => {
      expect(stub.callsTo('/auth/register')).toHaveLength(1);
    });

    // Not merely empty — absent. The API runs `forbidNonWhitelisted: true`, and a
    // stored empty name would render as a blank display name everywhere instead
    // of falling back to the email.
    expect(registerBody()).not.toHaveProperty('displayName');
    expect(registerBody()).toEqual({ email: EMAIL, password: PASSWORD });
  });

  it('omits a display name that was typed and then cleared', async () => {
    stub = stubFetch(() => jsonResponse(201, TOKENS));
    await renderRegister();

    await fillForm({ displayName: 'Jatin' });
    await fireEvent.changeText(
      screen.getByLabelText('Display name (optional)'),
      '   ',
    );
    await submit();

    await waitFor(() => {
      expect(stub.callsTo('/auth/register')).toHaveLength(1);
    });

    expect(registerBody()).not.toHaveProperty('displayName');
  });

  it('enforces the 8-character floor before spending a round trip on it', async () => {
    stub = stubFetch(() => jsonResponse(201, TOKENS));
    await renderRegister();

    await fillForm({ password: 'short' });
    await submit();

    expect(await screen.findByText('Use at least 8 characters')).toBeTruthy();
    expect(stub.calls).toHaveLength(0);
  });

  it('points a duplicate email at the screen that would actually work', async () => {
    stub = stubFetch(() =>
      errorResponse(
        409,
        'EMAIL_ALREADY_REGISTERED',
        'Email already registered',
      ),
    );
    const { store } = await renderRegister();

    await fillForm();
    await submit();

    expect(
      await screen.findByRole('alert', { name: 'Sign-up failed' }),
    ).toBeTruthy();
    expect(
      screen.getByText('That email already has an account. Sign in instead.'),
    ).toBeTruthy();
    expect(screen.getByText('EMAIL_ALREADY_REGISTERED')).toBeTruthy();

    expect(store.getState().auth.status).not.toBe('authenticated');
  });

  it('surfaces the fields a server-side validation failure named', async () => {
    stub = stubFetch(() =>
      jsonResponse(400, {
        statusCode: 400,
        code: 'VALIDATION_FAILED',
        message: 'Validation failed',
        details: [{ field: 'email', constraint: 'isEmail' }],
        path: '/api/v1/auth/register',
        timestamp: '2026-07-30T00:00:00.000Z',
        requestId: 'req-1',
      }),
    );
    await renderRegister();

    await fillForm();
    await submit();

    // This firing at all means the zod schema and the API's DTO have drifted, so
    // the server's own `details` is the useful part — not its generic headline.
    expect(await screen.findByText('The server rejected email.')).toBeTruthy();
    expect(screen.getByText('VALIDATION_FAILED')).toBeTruthy();
  });

  it('offers a route back to sign-in', async () => {
    stub = stubFetch(() => jsonResponse(201, TOKENS));
    const { navigate } = await renderRegister();

    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Sign in' }));

    expect(navigate).toHaveBeenCalledWith('Login');
  });
});
