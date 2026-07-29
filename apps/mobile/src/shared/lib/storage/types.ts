/**
 * The narrow key/value contract the app persists preferences through.
 *
 * ## Why this interface exists at all
 *
 * MMKV is a native module. Constructing one runs Nitro's native initialiser, which
 * does not exist in a Node process — so the moment `store/index.ts` imports MMKV at
 * module scope, *every* Jest test that touches the store throws on import, long
 * before any assertion runs (react-native-mmkv#934, #945).
 *
 * Depending on this interface instead of on MMKV directly means the store is
 * constructed with whatever storage it is handed: the real MMKV-backed one in the
 * app, a plain object in tests. That keeps the native module out of the test
 * process entirely rather than mocking around it.
 *
 * The surface is deliberately three methods wide — only what preference
 * persistence needs. A wider interface would be harder to fake and would invite
 * business logic into the storage layer.
 */
export interface KeyValueStorage {
  /** Reads a value, or `undefined` when the key was never written. */
  getString(key: string): string | undefined;
  /** Writes a value, overwriting any existing one. */
  set(key: string, value: string): void;
  /** Removes a key. A no-op when the key is absent. */
  delete(key: string): void;
}
