import {
  PREFERENCES_STORAGE_KEY,
  themeModeChanged,
} from '@features/preferences/model/preferences.slice';
import { createMemoryStorage } from '@shared/lib/storage/memory-storage';
import { createTestStore } from '@shared/test/create-test-store';

/**
 * These tests are the reason `createAppStore` takes its dependencies as parameters.
 *
 * Importing `@store` instead would construct the real MMKV instance and throw
 * during module evaluation, so the suite would fail on import rather than on an
 * assertion. Building the store per test with an injected fake keeps the native
 * module out of the Node process entirely.
 */
describe('createAppStore', () => {
  it('starts from defaults when storage is empty', () => {
    const store = createTestStore();

    expect(store.getState().preferences.themeMode).toBe('system');
  });

  it('hydrates synchronously from storage, with no rehydration action', () => {
    const storage = createMemoryStorage();
    storage.set(PREFERENCES_STORAGE_KEY, JSON.stringify({ themeMode: 'dark' }));

    const store = createTestStore({ storage });

    // The assertion that matters is that this is true *immediately* — before any
    // dispatch and without awaiting anything. That is what makes a cold start free
    // of a flash of the wrong theme.
    expect(store.getState().preferences.themeMode).toBe('dark');
  });

  it('ignores a corrupt persisted blob instead of crashing', () => {
    const storage = createMemoryStorage();
    storage.set(PREFERENCES_STORAGE_KEY, 'not json at all');

    const store = createTestStore({ storage });

    expect(store.getState().preferences.themeMode).toBe('system');
  });

  it('writes preferences back to storage when they change', () => {
    const storage = createMemoryStorage();
    const store = createTestStore({ storage });

    store.dispatch(themeModeChanged('light'));

    expect(storage.getString(PREFERENCES_STORAGE_KEY)).toBe(
      JSON.stringify({ themeMode: 'light' }),
    );
  });

  it('round-trips through storage into a fresh store', () => {
    // The real-world sequence: change a preference, the process dies, the app
    // starts again. Two stores over one storage is exactly that.
    const storage = createMemoryStorage();
    createTestStore({ storage }).dispatch(themeModeChanged('dark'));

    const relaunched = createTestStore({ storage });

    expect(relaunched.getState().preferences.themeMode).toBe('dark');
  });

  it('gives each store its own state', () => {
    // Guards the "fresh store per test" property: a shared store would leak the RTK
    // Query cache between tests, so a case could pass alone and fail in the suite.
    const first = createTestStore();
    const second = createTestStore();

    first.dispatch(themeModeChanged('dark'));

    expect(second.getState().preferences.themeMode).toBe('system');
  });
});
