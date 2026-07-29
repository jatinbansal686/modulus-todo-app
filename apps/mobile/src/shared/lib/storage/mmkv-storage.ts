import { createMMKV } from 'react-native-mmkv';

import type { KeyValueStorage } from './types';

/**
 * ⚠️ This module constructs a native MMKV instance at import time.
 *
 * It must therefore only ever be imported from the app's composition root
 * (`src/store/index.ts`), never from a module that a test might pull in. Everything
 * else depends on the {@link KeyValueStorage} interface, so tests get
 * `createMemoryStorage()` and this file is never loaded in a Node process.
 */

/**
 * Preferences live in their own MMKV instance rather than the default one.
 *
 * A named id keeps them in a separate file on disk, so clearing preferences can
 * never disturb anything else we might store later, and the file is identifiable
 * when inspecting the device.
 *
 * Note this is `createMMKV(...)`, not `new MMKV(...)`. react-native-mmkv v4 moved
 * to a Nitro hybrid object: `MMKV` is now an exported **type** only, so `new MMKV()`
 * compiles under a loose import and then fails at runtime with
 * "undefined cannot be used as a constructor" — verified on device.
 */
const mmkv = createMMKV({ id: 'modulus-todo.preferences' });

/**
 * The production {@link KeyValueStorage}, backed by MMKV.
 *
 * MMKV is synchronous and memory-mapped, which is what makes it usable from a
 * Redux listener: the persistence write happens inline after the reducer runs with
 * no promise to await and no chance of the app being killed between the state
 * change and the write.
 *
 * The adapter also normalises one naming difference — MMKV v4 calls key removal
 * `remove()`, while the rest of the app (and `Map`, and `localStorage`) call it
 * `delete()`. Translating here keeps that detail from leaking into feature code.
 */
export const mmkvStorage: KeyValueStorage = {
  getString(key) {
    return mmkv.getString(key);
  },
  set(key, value) {
    mmkv.set(key, value);
  },
  delete(key) {
    mmkv.remove(key);
  },
};
