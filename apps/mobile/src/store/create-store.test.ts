import {
  PREFERENCES_STORAGE_KEY,
  themeModeChanged,
} from '@features/preferences/model/preferences.slice';
import { createMemoryStorage } from '@shared/lib/storage/memory-storage';
import { createAppStore } from './create-store';

/**
 * These tests are the reason `createAppStore` takes its storage as a parameter.
 *
 * Importing `@store` instead would construct the real MMKV instance and throw
 * during module evaluation, so the suite would fail on import rather than on an
 * assertion. Building the store per test with an injected fake keeps the native
 * module out of the Node process entirely.
 */
describe('createAppStore', () => {
  it('starts from defaults when storage is empty', () => {
    const store = createAppStore({ storage: createMemoryStorage() });

    expect(store.getState().preferences.themeMode).toBe('system');
  });

  it('hydrates synchronously from storage, with no rehydration action', () => {
    const storage = createMemoryStorage();
    storage.set(PREFERENCES_STORAGE_KEY, JSON.stringify({ themeMode: 'dark' }));

    const store = createAppStore({ storage });

    // The assertion that matters is that this is true *immediately* — before any
    // dispatch and without awaiting anything. That is what makes a cold start free
    // of a flash of the wrong theme.
    expect(store.getState().preferences.themeMode).toBe('dark');
  });

  it('ignores a corrupt persisted blob instead of crashing', () => {
    const storage = createMemoryStorage();
    storage.set(PREFERENCES_STORAGE_KEY, 'not json at all');

    const store = createAppStore({ storage });

    expect(store.getState().preferences.themeMode).toBe('system');
  });

  it('writes preferences back to storage when they change', () => {
    const storage = createMemoryStorage();
    const store = createAppStore({ storage });

    store.dispatch(themeModeChanged('light'));

    expect(storage.getString(PREFERENCES_STORAGE_KEY)).toBe(
      JSON.stringify({ themeMode: 'light' }),
    );
  });

  it('round-trips through storage into a fresh store', () => {
    // The real-world sequence: change a preference, the process dies, the app
    // starts again. Two stores over one storage is exactly that.
    const storage = createMemoryStorage();
    createAppStore({ storage }).dispatch(themeModeChanged('dark'));

    const relaunched = createAppStore({ storage });

    expect(relaunched.getState().preferences.themeMode).toBe('dark');
  });

  it('gives each store its own state', () => {
    // Guards the "fresh store per test" property: once RTK Query arrives, a shared
    // store would leak the request cache between tests.
    const first = createAppStore({ storage: createMemoryStorage() });
    const second = createAppStore({ storage: createMemoryStorage() });

    first.dispatch(themeModeChanged('dark'));

    expect(second.getState().preferences.themeMode).toBe('system');
  });
});
