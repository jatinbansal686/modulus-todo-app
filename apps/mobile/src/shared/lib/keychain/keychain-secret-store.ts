import * as Keychain from 'react-native-keychain';

import type { SecretStore } from './types';

/**
 * Service name the credential is filed under.
 *
 * Explicit rather than defaulted, so this app's entry is identifiable on the device
 * and so the diagnostics smoke check — which uses its own service — can never
 * overwrite the real session.
 */
const SERVICE = 'com.jatinbansal.modulustodo.refresh';

/**
 * The username half of the credential pair.
 *
 * Keychain's generic-password API insists on a username; only the password field
 * carries anything meaningful here. Storing the account email instead would put a
 * user identifier in the keystore for no gain — the token alone identifies the
 * session, and the server resolves the user from it.
 */
const ACCOUNT = 'refresh-token';

/**
 * The production {@link SecretStore}, backed by the Android Keystore.
 *
 * Deliberately **not** MMKV-with-encryption. MMKV's encryption key is a plain
 * JavaScript string, and MMKV's own documentation says to keep that key in the
 * keystore — so "encrypted MMKV" without a keystore means the key is hardcoded in a
 * Hermes bundle inside an APK anyone can unzip. That is obfuscation, not encryption.
 */
export const keychainSecretStore: SecretStore = {
  async getRefreshToken() {
    // Returns `false` — not null, not a throw — when nothing is stored.
    const credentials = await Keychain.getGenericPassword({ service: SERVICE });
    return credentials === false ? null : credentials.password;
  },

  async setRefreshToken(token) {
    await Keychain.setGenericPassword(ACCOUNT, token, { service: SERVICE });
  },

  async clearRefreshToken() {
    await Keychain.resetGenericPassword({ service: SERVICE });
  },
};
