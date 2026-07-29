import { mmkvStorage } from '@shared/lib/storage/mmkv-storage';
import { createAppStore } from './create-store';

/**
 * ⚠️ **Composition root — importing this module constructs a native MMKV instance.**
 *
 * Only the app entry point should import from here. Tests, and any module a test
 * might transitively reach, must import `createAppStore` from `./create-store` and
 * pass `createMemoryStorage()` instead. Importing this file in a Node process runs
 * Nitro's native initialiser and throws on import, before any assertion executes.
 */
export const store = createAppStore({ storage: mmkvStorage });

export type { AppDispatch, AppStore, RootState } from './create-store';
