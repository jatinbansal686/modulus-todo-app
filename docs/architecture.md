# Architecture

How a request moves through the system, how a session stays alive, what's stored where, and how
the mobile codebase is laid out. Visual and interaction design lives in [`ui-spec.md`](ui-spec.md);
the deployment runbook lives in [`deployment.md`](deployment.md). This document is the rest.

---

## Request flow

A typical authenticated call, `GET /tasks`, end to end:

1. **Mobile.** A screen calls a generated RTK Query hook (`useListTasksQuery`) against the single
   `api` slice (`apps/mobile/src/shared/api/api.ts`).
2. **Base query.** `baseQueryWithReauth` attaches the in-memory access token, waits behind any
   refresh already in flight, and sends the request through `fetchBaseQuery` wrapping a
   timeout-safe `fetch` (`shared/api/base-query.ts`, `shared/api/fetch-with-timeout.ts`).
3. **NestJS pipeline**, in order: `helmet()` → the correlation-id middleware (assigns/echoes an
   `x-request-id` header before body parsing, `common/context/request-context.ts`) → JSON body
   parsing (256 KB limit) → the body-parser error middleware → the global `api/v1` prefix
   (`health`, `health/ready` and `docs` excluded) → the global `ValidationPipe`
   (`whitelist`/`forbidNonWhitelisted`/`transform`) → the global `JwtAuthGuard` (verifies the
   bearer JWT, algorithm pinned to `HS256`; skipped for `@Public()` routes) → the global
   throttler (120 req/min by default; 10 req/min on auth routes).
4. **Controller.** `TasksController` reads the caller's id from the verified token
   (`@CurrentUser('sub')`) — never from the URL or body — and calls `TasksService`.
5. **Service.** `TasksService` maps DTO wire types (ISO date strings) onto model types (`Date`)
   and enforces invariants the client shouldn't have to get right itself, e.g. keeping
   `completedAt` in lockstep with `status`.
6. **Repository.** `TasksRepository` is the only place that talks to Mongoose, and every method
   folds `userId` into the filter — ownership is enforced in one place rather than trusted to
   each call site.
7. **Database.** Mongoose executes against MongoDB Atlas (M0 free tier — see `deployment.md`).
8. **Errors.** A failure anywhere in that chain — a thrown domain exception, a Mongoose
   `CastError`, a duplicate-key `11000`, a throttler rejection, or a genuine bug — passes through
   one `AllExceptionsFilter`, the only place an error becomes an HTTP response (see "Error
   envelope" below).

The response flows back through the same chain. On the client, a mutation's optimistic patch (if
it has one) resolves or rolls back once `queryFulfilled` settles.

---

## Token lifecycle

Access tokens are short-lived JWTs kept only in memory; refresh tokens are long-lived opaque
values kept only in the Keychain. The two failure branches below are what keep that split honest.

```mermaid
sequenceDiagram
    participant App as Mobile app (Redux)
    participant KC as Keychain
    participant API as NestJS API

    App->>API: POST /auth/login (email, password)
    API-->>App: 200 { accessToken (15 min), refreshToken (30 days), user }
    App->>App: accessToken kept in memory (Redux) only
    App->>KC: refreshToken stored (never enters Redux)

    Note over App,API: --- later: the access token has expired ---

    App->>API: GET /tasks (Bearer accessToken)
    API-->>App: 401 { code: AUTH_TOKEN_EXPIRED }

    App->>App: acquire refreshMutex (serialises concurrent 401s)
    App->>KC: read refreshToken
    App->>API: POST /auth/refresh { refreshToken } — plain fetch, bypasses RTK Query

    alt refresh accepted
        API-->>App: 200 { accessToken (new), refreshToken (echoed back unchanged) }
        App->>App: dispatch tokensRefreshed; release mutex
        App->>API: retry GET /tasks (Bearer new accessToken)
        API-->>App: 200 tasks
    else AUTH_TOKEN_INVALID or AUTH_REFRESH_REUSED
        API-->>App: 401 { code }
        App->>KC: clear refreshToken
        App->>App: dispatch sessionExpired; release mutex
        App->>App: navigator switches to the Login stack
    else network error, timeout, or 5xx — no verdict
        App->>App: keep the session; release mutex; surface the original error
    end
```

Notes that don't fit in the diagram:

- **Access token** — JWT, `HS256`, 15-minute TTL (`JWT_ACCESS_TTL`), held only in
  `features/auth/model/auth.slice.ts` — never written to disk.
- **Refresh token** — an opaque 64-byte random value (not a JWT), 30-day TTL
  (`JWT_REFRESH_TTL_DAYS`), held only in the Android Keystore via `react-native-keychain`
  (`shared/lib/keychain/keychain-secret-store.ts`) — never enters Redux.
- The server stores only an HMAC-SHA256 of the refresh token (`refresh-token.service.ts`), keyed
  by a pepper that lives outside the database — a database leak alone yields no usable token.
- **`AUTH_REFRESH_REUSED` is reserved, not yet reachable.** `POST /auth/refresh` currently echoes
  the same refresh token back rather than rotating it. The schema already carries `familyId` and
  `replacedByTokenHash`, and `RefreshTokenService.revokeFamily` already exists, but nothing calls
  it yet — so the "reuse" branch above is the contract the client already honours, not a path the
  server can currently trigger. Rotation is the remaining wiring.
- **Refreshing also happens proactively**, not only on a 401: `refreshIfExpiring` runs when the
  app returns to the foreground with under 60 seconds left on the access token, so a resumed app
  gets one round trip instead of a failed request followed by a repair.
- Every refresh — reactive, proactive, or the one that runs during cold-start bootstrap — takes
  the same `Mutex` (`shared/api/thunk-extra.ts`), so at most one is ever in flight, and a request
  fired mid-refresh queues behind it instead of racing it with a stale token.
- A failed refresh only ends the session on an explicit server verdict. Offline, a timeout, or a
  5xx leaves the session intact — the client has no evidence the refresh token is actually bad.

---

## Data model

All three schemas set `autoIndex: false` in production; `src/database/sync-indexes.ts` runs
`syncIndexes()` once at boot, before the app accepts traffic, so a rolling restart never triggers
a surprise index build against live data. A failure there is logged rather than fatal, and names
exactly which guarantees — unique email, unique token hash, the refresh-token TTL — are
unenforced until it succeeds.

### User (`modules/users/schemas/user.schema.ts`, collection `users`)

| Field                     | Type    | Notes                                                                                                             |
| ------------------------- | ------- | ----------------------------------------------------------------------------------------------------------------- |
| `email`                   | string  | lowercased + trimmed on write                                                                                     |
| `passwordHash`            | string  | Argon2id hash; `select: false` — excluded from every query unless explicitly requested (only the login path does) |
| `displayName`             | string? | max 80 chars                                                                                                      |
| `createdAt` / `updatedAt` | Date    | from `timestamps: true`                                                                                           |

**Index:** unique on `email`.

### RefreshToken (`modules/auth/schemas/refresh-token.schema.ts`, collection `refresh_tokens`)

| Field                 | Type           | Notes                                                                                                   |
| --------------------- | -------------- | ------------------------------------------------------------------------------------------------------- |
| `userId`              | ObjectId       | ref `User`                                                                                              |
| `tokenHash`           | string         | HMAC-SHA256 of the token — the token itself is never stored                                             |
| `familyId`            | string         | groups every token descended from one login; not yet used to revoke (rotation is deferred)              |
| `replacedByTokenHash` | string \| null | reserved for rotation — lets a presented old token be recognised as _used_ rather than merely _unknown_ |
| `revokedAt`           | Date \| null   | set by logout / logout-all                                                                              |
| `expiresAt`           | Date           | TTL index, `expireAfterSeconds: 0` — MongoDB deletes the document itself once this passes               |
| `userAgent`           | string?        | max 256 chars, informational only                                                                       |

**Indexes:** unique on `tokenHash`; TTL on `expiresAt`; compound `{ userId: 1, revokedAt: 1 }`
(serves "revoke every session for this user"); single-field on `familyId`.

### Task (`modules/tasks/schemas/task.schema.ts`, collection `tasks`)

| Field                     | Type                              | Notes                                                                              |
| ------------------------- | --------------------------------- | ---------------------------------------------------------------------------------- |
| `userId`                  | ObjectId                          | ref `User`                                                                         |
| `title`                   | string                            | required, max 200                                                                  |
| `description`             | string                            | max 5000, default `''`                                                             |
| `scheduledAt`             | Date \| null                      | the brief's "date-time" — when the user intends to work on it                      |
| `dueAt`                   | Date \| null                      | the deadline — the only field the overdue signal and the row's countdown read from |
| `priority`                | `LOW \| MEDIUM \| HIGH \| URGENT` | default `MEDIUM`; stored as strings so a raw document stays readable               |
| `status`                  | `TODO \| DONE`                    | default `TODO`                                                                     |
| `completedAt`             | Date \| null                      | set/cleared in lockstep with `status` by the service layer                         |
| `tags`                    | string[]                          | default `[]` — the "categories or tags" bonus                                      |
| `deletedAt`               | Date \| null                      | soft delete; stripped from the JSON response entirely                              |
| `createdAt` / `updatedAt` | Date                              | from `timestamps: true`                                                            |

**Indexes:** compound `{ userId: 1, deletedAt: 1, status: 1, dueAt: 1 }` (the list endpoint's
actual query shape — one user's live tasks, optionally by status, ordered by deadline); compound
`{ userId: 1, deletedAt: 1, createdAt: -1 }` (fallback newest-first ordering). No text index:
`$text` matches whole stemmed terms, so "gro" wouldn't find "groceries" — search is out of scope,
and a client-side filter over the loaded page is both better UX and free if it returns.

---

## State management

One RTK Query API instance (`shared/api/api.ts`), injected into by each feature (`authApi`,
`tasksApi`) via `injectEndpoints` — a single cache and a single mental model, rather than one
store per feature.

**Tags.** `tagTypes: ['Task', 'Session']`. `Session` is declared but not yet used by any
endpoint. `Task` invalidation uses a shared list tag plus a per-item `{ type: 'Task', id }` tag:

- `listTasks` provides the list tag and one tag per row it returns.
- `createTask` invalidates the list tag.
- `updateTask` / `restoreTask` invalidate their own item tag and the list tag.
- `toggleTask` / `deleteTask` invalidate **nothing** — see optimistic updates below.

**Optimistic updates.** `toggleTask` and `deleteTask` patch the cache immediately via
`tasksApi.util.selectInvalidatedBy(...)` + `updateQueryData`, and roll the patch back if
`queryFulfilled` rejects. `selectInvalidatedBy` finds every cached `listTasks` entry that actually
holds the `Task` tag, whatever arguments it was fetched with; the more obvious alternative,
`updateQueryData('listTasks', undefined, recipe)`, only patches the one cache entry fetched with
literally no arguments — the standard way this pattern silently fails to update anything visible.
`createTask` and `updateTask` are deliberately **not** optimistic: they run behind a modal that
only dismisses on success, so there's no stale row to look at in the meantime.

**What's persisted, and how.**

| Slice                 | Persisted?       | Mechanism                                                                                                                                                                                                                                 |
| --------------------- | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `preferences` (theme) | Yes              | A `createListenerMiddleware` effect mirrors it to MMKV on every change; read back synchronously and passed to `configureStore` as `preloadedState`, so there's no rehydration action and no flash of the wrong theme                      |
| `auth`                | No, deliberately | The access token is memory-only; the refresh token lives in the Keychain, entirely outside Redux. A state snapshot in a bug report can leak neither                                                                                       |
| RTK Query cache       | No               | Per Redux's own guidance, a stale cache restored from disk is worse than a refetch; also explicitly cleared (`api.util.resetApiState()`) on sign-out so the next person to use the device never sees a flash of the previous user's tasks |

The auth slice and the base query never call each other directly. They communicate through two
plain actions declared in `shared/api/auth-events.ts` — `tokensRefreshed` and `sessionExpired` —
which `shared` dispatches and `features/auth` interprets in `extraReducers`. That indirection is
what keeps `shared` from importing `features` (see below) and avoids an import cycle
(slice → api → base query → slice).

---

## Error envelope and the auth sub-code contract

Every failure — a deliberately thrown domain exception, a Mongoose `CastError` or
`ValidationError`, a duplicate-key `11000`, a throttler rejection, or a genuine bug — passes
through one `AllExceptionsFilter` and leaves in the same shape:

```ts
interface ErrorEnvelope {
  statusCode: number;
  code: string; // stable, machine-readable — see below
  message: string;
  details?: { field: string; constraint: string }[]; // validation failures only
  path: string;
  timestamp: string;
  requestId: string; // correlates with the server log line that recorded the cause
}
```

A 5xx is logged with its full stack against `requestId`; the response itself says nothing more
specific than "An unexpected error occurred" — the underlying message could otherwise name a
collection, a file path, or a connection string.

**The auth sub-code contract.** A bare 401 can't say _why_, and the mobile client needs to know,
because it reacts differently to each:

| Code                       | Meaning                                                                         | Client reaction                                                                                                              |
| -------------------------- | ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `AUTH_TOKEN_EXPIRED`       | Access token's signature is valid; it has simply aged out                       | Refresh silently and retry                                                                                                   |
| `AUTH_TOKEN_MISSING`       | No bearer token was presented                                                   | Treated the same as expired — also what a request racing the optimistic-bootstrap window looks like                          |
| `AUTH_TOKEN_INVALID`       | Token is malformed, mis-signed, or the refresh token itself was rejected        | Terminal — clear the Keychain, sign out                                                                                      |
| `AUTH_REFRESH_REUSED`      | A refresh token already consumed by rotation was presented again (theft signal) | Terminal, same as above. Reserved — see "Token lifecycle"; the server can't emit this yet, but the client already honours it |
| `AUTH_CREDENTIALS_INVALID` | Wrong email/password at `/auth/login`                                           | Passed straight through, untouched — a login-form error, not a session repair                                                |

`AUTH_TOKEN_EXPIRED` and `AUTH_TOKEN_MISSING` are the only two codes the base query treats as
recoverable; `AUTH_TOKEN_INVALID` and `AUTH_REFRESH_REUSED` are the only two treated as terminal.
Everything else — including `AUTH_CREDENTIALS_INVALID` — passes through unmodified for the
screen that triggered it to render.

---

## Feature-sliced structure (mobile)

```
apps/mobile/src/
├── app/          providers, navigation, the App root — composes everything below
├── features/     auth · tasks · preferences — one folder per feature, each with its
│                 own api/ (RTK Query endpoints), model/ (slices, pure logic) and
│                 screens/ or components/
├── shared/       api · lib · theme · types · config · ui · test — depends on nothing above
└── store/        the Redux store factory and typed hooks
```

**The layering rule: `shared` may not import `features`.** This is enforced by convention and by
the alias imports (`@app`, `@features`, `@shared`, `@store`), not by a lint rule — there's no
`eslint-plugin-boundaries` or `import/no-restricted-paths` configured in this repo, so a
violation would currently be caught in review rather than in CI. What _is_ mechanically in place
is the one spot the rule would otherwise be broken: the re-auth base query
(`shared/api/base-query.ts`) has to tell the auth slice (`features/auth`) that a session ended,
and does it by dispatching a plain action declared in `shared/api/auth-events.ts` rather than
importing the slice's own action creators — `shared` owns the vocabulary, `features/auth`
decides what the events mean.

Two supporting conventions:

- Imports **across** layers always go through the alias (e.g. `@shared/api/api`); imports
  **within** a module stay relative. That way a line crossing an architectural boundary looks
  different from one that doesn't, at the point it happens.
- Anything that touches a native module at import time (MMKV, Keychain) is confined to a single
  composition root (`store/index.ts`, `app/providers/app-providers.tsx`) that only the app entry
  point imports. Everything else — including every test — depends on an interface
  (`KeyValueStorage`, `SecretStore`) and is handed an in-memory implementation instead, which is
  what lets 203 tests run in a plain Node process with no native modules and no emulator.
