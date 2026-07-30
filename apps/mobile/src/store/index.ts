import { keychainSecretStore } from '@shared/lib/keychain/keychain-secret-store';
import { mmkvStorage } from '@shared/lib/storage/mmkv-storage';
import { createAppStore } from './create-store';

/**
 * ⚠️ **Composition root — importing this module touches native modules.**
 *
 * It constructs an MMKV instance eagerly and binds the Keychain-backed secret store.
 * Only the app entry point should import from here. Tests, and any module a test
 * might transitively reach, must import `createAppStore` from `./create-store` and
 * pass `createMemoryStorage()` / `createMemorySecretStore()` instead. Importing this
 * file in a Node process runs Nitro's native initialiser and throws on import,
 * before any assertion executes.
 */
export const store = createAppStore({
  storage: mmkvStorage,
  secretStore: keychainSecretStore,
});

export type { AppDispatch, AppStore, RootState } from './create-store';
