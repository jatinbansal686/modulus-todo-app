/**
 * Storage for the one secret this app keeps on disk: the refresh token.
 *
 * ## Why this is separate from `KeyValueStorage`
 *
 * Preferences and the refresh token have genuinely different requirements, and
 * collapsing them would lose the distinction that matters most here:
 *
 * - **Preferences** are not secret and are read *synchronously* (MMKV is
 *   memory-mapped), which is why the theme is available before the first render.
 * - **The refresh token** is a credential, so it belongs in the OS keystore — and
 *   the keystore API is **asynchronous**. That single fact is why the app needs an
 *   explicit bootstrap gate at all: the signed-in/signed-out decision cannot be
 *   made during module evaluation, so something has to cover the gap.
 *
 * Injected as an interface for the same reason as `KeyValueStorage`: the real
 * implementation is a native module that does not exist in a Node process, so tests
 * supply an in-memory one instead of mocking around it.
 */
export interface SecretStore {
  /** Reads the stored refresh token, or `null` when there is none. */
  getRefreshToken(): Promise<string | null>;
  /** Stores a refresh token, replacing any existing one. */
  setRefreshToken(token: string): Promise<void>;
  /** Removes the stored refresh token. Safe to call when none exists. */
  clearRefreshToken(): Promise<void>;
}
