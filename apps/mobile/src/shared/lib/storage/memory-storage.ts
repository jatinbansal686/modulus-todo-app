import type { KeyValueStorage } from './types';

/**
 * An in-memory {@link KeyValueStorage}, used by tests and as the safe default.
 *
 * Each call returns an independent store. That matters: a module-level shared Map
 * would leak preferences between tests, so a test that persists a theme would
 * change the starting state of whichever test happens to run next — the classic
 * ordering-dependent flake.
 *
 * @returns A fresh, isolated storage instance.
 */
export function createMemoryStorage(): KeyValueStorage {
  const values = new Map<string, string>();

  return {
    getString(key) {
      return values.get(key);
    },
    set(key, value) {
      values.set(key, value);
    },
    delete(key) {
      values.delete(key);
    },
  };
}
