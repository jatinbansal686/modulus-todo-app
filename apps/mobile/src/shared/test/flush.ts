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
