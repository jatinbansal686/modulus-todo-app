/**
 * A recording stub for `globalThis.fetch`.
 *
 * Both halves of the API client go through `fetch` — `fetchBaseQuery` for normal
 * requests and {@link refreshSession} for the token exchange — so stubbing this one
 * function drives the entire re-auth path, including the interleaving between a
 * request and the refresh it triggers. That is what makes the concurrency behaviour
 * testable at all.
 *
 * Chosen over MSW deliberately: MSW's own documentation describes its React Native
 * integration as potentially incomplete, and everything these tests need is a
 * function that returns responses and remembers what it was asked for.
 */

/** One recorded request. */
export interface RecordedCall {
  url: string;
  method: string;
  /** Parsed JSON body, or `undefined` when there was none. */
  body: unknown;
}

/** Handle returned by {@link stubFetch}, for assertions and cleanup. */
export interface FetchStub {
  /** Every request made, in order. */
  calls: RecordedCall[];
  /** Requests whose URL contains `fragment`. */
  callsTo(fragment: string): RecordedCall[];
  /** Restores the previous `globalThis.fetch`. */
  restore(): void;
}

/** Builds a JSON response the way the API would send it. */
export function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/** Builds the API's error envelope, so tests exercise the real shape. */
export function errorResponse(
  status: number,
  code: string,
  message = 'Test error',
): Response {
  return jsonResponse(status, {
    statusCode: status,
    code,
    message,
    path: '/api/v1/test',
    timestamp: '2026-07-30T00:00:00.000Z',
    requestId: 'test-request-id',
  });
}

/**
 * The rejection real `fetch` produces when its signal aborts.
 *
 * A plain `Error` with an overridden name rather than a `DOMException`, matching what
 * the app-side code does — `DOMException` is not reliably present under Hermes, and
 * only `name` is ever inspected.
 */
function abortError(): Error {
  return Object.assign(new Error('The operation was aborted.'), {
    name: 'AbortError',
  });
}

/** The abort signal in force, from either call shape. */
function signalOf(
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

/** Parses a JSON body, tolerating bodies that are not JSON. */
function parseBody(text: string): unknown {
  if (!text) {
    return undefined;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

/**
 * Normalises the two shapes `fetch` can be called with into one record.
 *
 * ⚠️ The `Request` branch is load-bearing. `refreshSession` calls
 * `fetch(urlString, init)`, but `fetchBaseQuery` builds a `Request` and calls
 * `fetchFn(request)` — so a stub that only reads string URLs sees
 * `"[object Request]"` for every RTK-originated call and cannot tell endpoints
 * apart. That silently weakens any test that branches on the URL: one keyed on it
 * would treat three different requests as the same one.
 */
async function describeRequest(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<RecordedCall> {
  if (typeof input === 'object' && input !== null && 'url' in input) {
    const request = input as Request;
    // Clone before reading: consuming the body would leave the real code with a
    // used stream if it ever needed it.
    const text = await request.clone().text();
    return {
      url: request.url,
      method: request.method,
      body: parseBody(text),
    };
  }

  const rawBody = init?.body;
  return {
    url: String(input),
    method: init?.method ?? 'GET',
    body: typeof rawBody === 'string' ? parseBody(rawBody) : undefined,
  };
}

/**
 * Replaces `globalThis.fetch` with `handler`, recording every call.
 *
 * @param handler Receives the URL and the parsed request, returns a `Response`. Throw
 *   from it to simulate a network failure — that is what an offline device produces.
 * @returns A handle for assertions and cleanup. Call `restore()` in `afterEach`.
 */
export function stubFetch(
  handler: (call: RecordedCall) => Response | Promise<Response>,
): FetchStub {
  const original = globalThis.fetch;
  const calls: RecordedCall[] = [];

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const call = await describeRequest(input, init);
    calls.push(call);

    const response = Promise.resolve(handler(call));

    // Honour the abort signal, as real `fetch` does. Without this a stub silently
    // ignores cancellation, so timeout and abort paths in the code under test can
    // never actually be exercised — they just hang.
    const signal = signalOf(input, init);
    if (!signal) {
      return response;
    }
    if (signal.aborted) {
      throw abortError();
    }

    return Promise.race([
      response,
      new Promise<never>((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(abortError()), {
          once: true,
        });
      }),
    ]);
  }) as typeof globalThis.fetch;

  return {
    calls,
    callsTo(fragment) {
      return calls.filter((call) => call.url.includes(fragment));
    },
    restore() {
      globalThis.fetch = original;
    },
  };
}

/** A promise whose resolution the test controls, for pinning down interleavings. */
export function createDeferred<T = void>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
} {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}
