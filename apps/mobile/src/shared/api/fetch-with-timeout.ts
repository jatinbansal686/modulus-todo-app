/**
 * `fetch` with a request timeout that cleans up after itself.
 *
 * ## Why not `fetchBaseQuery({ timeout })`
 *
 * RTK Query's built-in `timeout` builds its abort signal with an internal
 * `timeoutSignal()` helper that calls `setTimeout(...)` and **never clears it** — the
 * timer is left to fire long after the request has succeeded. In the app that is
 * harmless: it aborts a controller nobody is listening to any more.
 *
 * Under Jest it is not harmless. Every request leaves a live 30-second timer, so the
 * process cannot exit and the run ends with "Jest did not exit one second after the
 * test run has completed" — followed by a 30-second wait on every CI build. Worse,
 * it trains everyone to ignore that warning, which is the one signal that would have
 * caught a *real* leak later.
 *
 * So the timeout is implemented here instead, with the timer cleared in a `finally`.
 * Same behaviour, no stray handles.
 *
 * @param timeoutMs How long to wait before aborting.
 * @returns A `fetch`-compatible function for `fetchBaseQuery`'s `fetchFn`.
 */
export function createFetchWithTimeout(timeoutMs: number): typeof fetch {
  return async (input, init) => {
    const controller = new AbortController();

    // A flag rather than `controller.abort(reason)`: the `reason` argument is not in
    // React Native's AbortController typings and is not honoured by its polyfill, so
    // the only reliable way to tell "we timed out" from "the caller cancelled" is to
    // remember which happened.
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);

    // RTK Query hands `fetchFn` a fully-built `Request` whose signal is how query
    // cancellation works. Compose with it rather than replacing it, or an unmounted
    // component's in-flight request stops being cancellable.
    const upstream = upstreamSignal(input, init);
    const forwardAbort = () => controller.abort();

    if (upstream) {
      if (upstream.aborted) {
        controller.abort();
      } else {
        upstream.addEventListener('abort', forwardAbort);
      }
    }

    try {
      return await fetch(input, { ...init, signal: controller.signal });
    } catch (error) {
      // `fetchBaseQuery` inspects `error.name` and maps `TimeoutError` onto its own
      // `TIMEOUT_ERROR` status, so re-labelling here is what lets the UI distinguish
      // "the server did not answer in time" from "the request was cancelled".
      throw timedOut ? timeoutError() : error;
    } finally {
      clearTimeout(timer);
      upstream?.removeEventListener('abort', forwardAbort);
    }
  };
}

/**
 * The error a timeout produces.
 *
 * A plain `Error` with the name overridden rather than a `DOMException`: React
 * Native's Hermes runtime does not reliably provide `DOMException`, and only the
 * `name` is load-bearing for the mapping described above.
 */
function timeoutError(): Error {
  return Object.assign(new Error('Request timed out'), {
    name: 'TimeoutError',
  });
}

/** The caller's signal, from either call shape. */
function upstreamSignal(
  input: RequestInfo | URL,
  init?: RequestInit,
): AbortSignal | null {
  if (init?.signal) {
    return init.signal;
  }
  if (typeof input === 'object' && input !== null && 'signal' in input) {
    return (input as Request).signal;
  }
  return null;
}
