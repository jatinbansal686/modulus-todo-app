/**
 * Jest global setup — native-module stand-ins.
 *
 * ## Why these mocks exist
 *
 * Every module below is a native module. In a Node process there is no native
 * side, so the JS half either throws during initialisation or returns `undefined`
 * where a class is expected. The most destructive case is MMKV: it initialises
 * through Nitro at *import* time, so any test that transitively reaches the store
 * throws while the module graph is still loading — before a single assertion runs,
 * and with a stack trace that points at the bridge rather than at the test.
 *
 * The app's own defence against this is the `KeyValueStorage` interface: tests
 * build a store with `createMemoryStorage()` and never touch MMKV. These mocks are
 * the second layer, covering the case where a component pulls in a native module
 * indirectly — which is exactly the sort of thing that appears later, in a PR
 * nobody expected to be about storage.
 */

/**
 * Nitro is the FFI layer MMKV sits on. Mocking it alone is not sufficient — the
 * mock below for `react-native-mmkv` is what tests actually use — but it makes an
 * unexpected Nitro consumer fail with a readable message instead of a segfault-ish
 * "Failed to get NitroModules".
 */
jest.mock('react-native-nitro-modules', () => ({
  NitroModules: {
    createHybridObject: () => {
      throw new Error(
        'A native Nitro module was constructed in a test. Inject a fake through ' +
          'the KeyValueStorage interface instead of importing the real module.',
      );
    },
    box: (value) => value,
  },
}));

/**
 * In-memory MMKV.
 *
 * Mirrors the v4 API — `createMMKV()` factory, `remove()` rather than `delete()` —
 * because a mock that mirrors an older API hides exactly the kind of breakage it
 * should surface. Each call returns an independent store so state cannot leak
 * between tests.
 */
jest.mock('react-native-mmkv', () => ({
  createMMKV: () => {
    const values = new Map();
    return {
      set: (key, value) => values.set(key, value),
      getString: (key) => values.get(key),
      getBoolean: (key) => values.get(key),
      getNumber: (key) => values.get(key),
      contains: (key) => values.has(key),
      remove: (key) => values.delete(key),
      getAllKeys: () => Array.from(values.keys()),
      clearAll: () => values.clear(),
    };
  },
}));

/**
 * In-memory Keychain, holding one credential per `service`.
 *
 * Async, like the real thing — the auth bootstrap depends on `getGenericPassword`
 * returning a Promise, and a synchronous mock would let a bug through where the
 * app awaits something that was never a promise.
 */
jest.mock('react-native-keychain', () => {
  const store = new Map();
  const keyFor = (options) => options?.service ?? 'default';

  return {
    setGenericPassword: async (username, password, options) => {
      store.set(keyFor(options), { username, password });
      return { service: keyFor(options), storage: 'mock' };
    },
    getGenericPassword: async (options) => store.get(keyFor(options)) ?? false,
    resetGenericPassword: async (options) => store.delete(keyFor(options)),
    hasGenericPassword: async (options) => store.has(keyFor(options)),
    getSecurityLevel: async () => 'SECURE_SOFTWARE',
    getSupportedBiometryType: async () => null,
  };
});
