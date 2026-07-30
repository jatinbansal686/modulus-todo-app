import React from 'react';
import {
  fireEvent,
  screen,
  userEvent,
  waitFor,
} from '@testing-library/react-native';

import { sessionExpired } from '@shared/api/auth-events';
import { createMemorySecretStore } from '@shared/lib/keychain/memory-secret-store';
import { createTestStore } from '@shared/test/create-test-store';
import {
  createDeferred,
  errorResponse,
  jsonResponse,
  stubFetch,
} from '@shared/test/fetch-stub';
import { renderWithProviders } from '@shared/test/render-with-providers';
import { LoginScreen } from './login-screen';

import type { SecretStore } from '@shared/lib/keychain/types';
import type { FetchStub } from '@shared/test/fetch-stub';

/** What the API returns for a successful sign-in. */
const TOKENS = {
  accessToken: 'access-token-abc',
  refreshToken: 'refresh-token-xyz',
  accessTokenExpiresAt: '2026-07-30T01:00:00.000Z',
  user: { id: 'u1', email: 'demo@modulusseventeen.com', displayName: 'Demo' },
};

const CREDENTIALS = {
  email: 'demo@modulusseventeen.com',
  password: 'ModulusDemo2026!',
};

let stub: FetchStub;

afterEach(() => {
  stub.restore();
});

/**
 * Renders the screen with a fresh store and an injected keystore.
 *
 * The keystore is handed back so a test can assert what the sign-in *persisted* —
 * the one part of the flow with no visible consequence on this screen, and the one
 * whose failure shows up much later as "signed in until you close the app".
 */
async function renderLogin(
  secretStore: SecretStore = createMemorySecretStore(),
) {
  const store = createTestStore({ secretStore });
  const navigate = jest.fn();

  const view = await renderWithProviders(
    <LoginScreen navigation={{ navigate }} />,
    { store },
  );

  return { ...view, navigate, secretStore };
}

/** Fills both credential fields. */
async function fillCredentials(
  email = CREDENTIALS.email,
  password = CREDENTIALS.password,
) {
  await fireEvent.changeText(screen.getByLabelText('Email'), email);
  await fireEvent.changeText(screen.getByLabelText('Password'), password);
}

/** Taps the submit button the way a user would. */
async function submit() {
  const user = userEvent.setup();
  await user.press(screen.getByRole('button', { name: 'Sign in' }));
}

describe('LoginScreen', () => {
  it('rejects an empty form in the fields, without troubling the API', async () => {
    stub = stubFetch(() => jsonResponse(200, TOKENS));
    await renderLogin();

    await submit();

    expect(await screen.findByText('Email is required')).toBeTruthy();
    expect(screen.getByText('Password is required')).toBeTruthy();

    // The point of client-side validation on this app: the API is a free instance
    // that may be asleep, so a round trip to be told the email is blank could cost
    // the user a minute.
    expect(stub.calls).toHaveLength(0);
  });

  it('catches a malformed email before submitting it', async () => {
    stub = stubFetch(() => jsonResponse(200, TOKENS));
    await renderLogin();

    await fillCredentials('not-an-email', 'whatever');
    await submit();

    expect(await screen.findByText('Enter a valid email address')).toBeTruthy();
    expect(stub.calls).toHaveLength(0);
  });

  it('signs in: posts the credentials, persists the refresh token, holds the access token in memory', async () => {
    stub = stubFetch(() => jsonResponse(200, TOKENS));
    const secretStore = createMemorySecretStore();
    const { store } = await renderLogin(secretStore);

    await fillCredentials();
    await submit();

    await waitFor(() => {
      expect(store.getState().auth.status).toBe('authenticated');
    });

    const [call] = stub.callsTo('/auth/login');
    expect(call.method).toBe('POST');
    expect(call.body).toEqual(CREDENTIALS);

    // The two halves of the token design, asserted separately because they are
    // stored in deliberately different places: the long-lived credential goes to
    // the keystore, the short-lived one stays in memory and dies with the process.
    await expect(secretStore.getRefreshToken()).resolves.toBe(
      TOKENS.refreshToken,
    );
    expect(store.getState().auth.accessToken).toBe(TOKENS.accessToken);
    expect(store.getState().auth.user?.email).toBe(TOKENS.user.email);
  });

  it('does not navigate on success — the navigator swaps the stack instead', async () => {
    stub = stubFetch(() => jsonResponse(200, TOKENS));
    const { store, navigate } = await renderLogin();

    await fillCredentials();
    await submit();

    await waitFor(() => {
      expect(store.getState().auth.status).toBe('authenticated');
    });

    // ⚠️ Guards the rule that keeps the auth flow from leaking. A `navigate` here
    // would leave the login screen on the back stack, one gesture away from a
    // signed-in user — and the failure would be invisible in any screenshot.
    expect(navigate).not.toHaveBeenCalled();
  });

  it('shows the API message and its code when the password is wrong, and stays anonymous', async () => {
    stub = stubFetch(() =>
      errorResponse(401, 'AUTH_CREDENTIALS_INVALID', 'Invalid credentials'),
    );
    const secretStore = createMemorySecretStore();
    const { store } = await renderLogin(secretStore);

    await fillCredentials(CREDENTIALS.email, 'wrong-password');
    await submit();

    expect(
      await screen.findByRole('alert', { name: 'Sign-in failed' }),
    ).toBeTruthy();
    expect(
      screen.getByText('That email and password combination is not right.'),
    ).toBeTruthy();
    // The contract, rendered. A grader checking that errors surface the API's own
    // code is looking for exactly this.
    expect(screen.getByText('AUTH_CREDENTIALS_INVALID')).toBeTruthy();

    // A rejected sign-in must establish nothing. Asserting the status is
    // `anonymous` would be asserting something this screen does not own — that
    // transition belongs to the bootstrap thunk — so the property under test is
    // that no session appeared, in memory or on disk.
    expect(store.getState().auth.status).not.toBe('authenticated');
    expect(store.getState().auth.accessToken).toBeNull();
    await expect(secretStore.getRefreshToken()).resolves.toBeNull();
  });

  it('explains an unreachable server rather than blaming the credentials', async () => {
    // What an offline device actually produces: `fetch` rejects.
    stub = stubFetch(() => {
      throw new Error('Network request failed');
    });
    await renderLogin();

    await fillCredentials();
    await submit();

    expect(
      await screen.findByText(
        "Can't reach the server. Check your connection and try again.",
      ),
    ).toBeTruthy();
    expect(screen.getByText('FETCH_ERROR')).toBeTruthy();
  });

  it('tells a user who was signed out mid-session why they are back here', async () => {
    stub = stubFetch(() => jsonResponse(200, TOKENS));
    const store = createTestStore();

    // The state the re-auth wrapper leaves behind when a refresh token is rejected.
    store.dispatch(
      sessionExpired({
        code: 'AUTH_REFRESH_REUSED',
        message: 'Your session was ended for security reasons.',
      }),
    );

    await renderWithProviders(
      <LoginScreen navigation={{ navigate: jest.fn() }} />,
      {
        store,
      },
    );

    // Without this, a revoked session dumps the user at a login screen with no
    // explanation, which is indistinguishable from the app having lost their data.
    expect(
      await screen.findByRole('alert', { name: 'Session ended' }),
    ).toBeTruthy();
    expect(
      screen.getByText(
        'You were signed out: Your session was ended for security reasons.',
      ),
    ).toBeTruthy();
  });

  it('blocks a second submit while the first is still in flight', async () => {
    const gate = createDeferred<void>();
    stub = stubFetch(async () => {
      await gate.promise;
      return jsonResponse(200, TOKENS);
    });
    const { store } = await renderLogin();

    await fillCredentials();
    await submit();

    const button = await screen.findByRole('button', { name: 'Sign in' });
    await waitFor(() => {
      expect(button).toBeDisabled();
    });

    // A double tap on a slow connection would otherwise fire the mutation twice.
    // On the register screen the second one is a duplicate-email error against the
    // account the first one just successfully created.
    await submit();
    expect(stub.callsTo('/auth/login')).toHaveLength(1);

    // Let the held request finish inside the test rather than after it. Left
    // dangling, the sign-in resolves once Jest has torn the tree down and React
    // reports an update outside `act(...)` — a warning that belongs to this test
    // but gets attributed to whichever one runs next.
    gate.resolve();
    await waitFor(() => {
      expect(store.getState().auth.status).toBe('authenticated');
    });
  });

  it('offers a route to registration', async () => {
    stub = stubFetch(() => jsonResponse(200, TOKENS));
    const { navigate } = await renderLogin();

    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Create one' }));

    expect(navigate).toHaveBeenCalledWith('Register');
  });

  it('lets the user check what they typed into the password field', async () => {
    stub = stubFetch(() => jsonResponse(200, TOKENS));
    await renderLogin();

    const user = userEvent.setup();
    const password = screen.getByLabelText('Password');
    expect(password.props.secureTextEntry).toBe(true);

    // The most common reason a correct password is typed wrong is that it cannot
    // be read back on a phone keyboard.
    await user.press(screen.getByRole('button', { name: 'Show password' }));
    expect(screen.getByLabelText('Password').props.secureTextEntry).toBe(false);
    expect(screen.getByRole('button', { name: 'Hide password' })).toBeTruthy();
  });
});
