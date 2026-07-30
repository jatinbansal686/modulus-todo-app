/**
 * Lets every already-scheduled promise callback run before continuing.
 *
 * Used to pin down interleavings: after `flushPending()` the code under test has
 * advanced as far as it can without new timers or I/O, so an assertion made here
 * describes a specific, reproducible moment — "all three requests have received
 * their 401 and contended for the lock" — rather than whatever the scheduler
 * happened to do.
 *
 * `setImmediate` rather than `await Promise.resolve()`: a single microtask tick only
 * drains one level of chained `then`s, and these paths are several awaits deep.
 * `setImmediate` runs after the entire microtask queue has emptied.
 *
 * Wrapped in an arrow so the promise's `resolve` is not passed the timer handle —
 * React Native types `setImmediate` as taking a zero-argument callback, so handing
 * it `resolve` directly is a type error.
 */
export function flushPending(): Promise<void> {
  return new Promise<void>((resolve) => {
    setImmediate(() => resolve());
  });
}

/**
 * Longest window RTK schedules internally, plus a margin.
 *
 * Two timers, both found by instrumenting `setTimeout` rather than guessed at:
 * `buildMiddleware/batchActions` batches subscription updates on a **500ms**
 * timer, and `autoBatchEnhancer` coalesces dispatches on a **100ms** one.
 */
const REDUX_BATCH_WINDOW_MS = 600;

/**
 * Waits out Redux's internal batching timers before a suite finishes.
 *
 * ## Why this is needed, and why only in some files
 *
 * A test that dispatches `endpoint.initiate()` straight at a store leaves those
 * two timers scheduled. They fire after Jest has torn the environment down, and
 * each one prints *"You are trying to access a property or method of the Jest
 * environment after it has been torn down"*. Tests that drive the same endpoints
 * through a rendered component never see it, because RNTL's cleanup unmounts the
 * hooks and RTK settles on its own.
 *
 * These are **not** leaks: both windows are bounded and self-clearing, so the
 * process exits fine either way. The warning is still worth removing — it is
 * indistinguishable from the output a genuine leak would produce, and a suite
 * that always prints it is a suite where nobody reads it.
 *
 * ⚠️ Neither `unsubscribe()` nor `resetApiState()` cancels these; both were tried.
 * Waiting is the only thing that works, so it is done **once per file** in an
 * `afterAll` rather than per test.
 *
 * @returns A promise resolving once both windows have elapsed.
 */
export function settleReduxBatching(): Promise<void> {
  return new Promise<void>((resolve) => {
    setTimeout(() => resolve(), REDUX_BATCH_WINDOW_MS);
  });
}
