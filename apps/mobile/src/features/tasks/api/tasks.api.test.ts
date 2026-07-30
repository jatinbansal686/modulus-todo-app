import { createTestStore } from '@shared/test/create-test-store';
import {
  createDeferred,
  errorResponse,
  jsonResponse,
  stubFetch,
} from '@shared/test/fetch-stub';
import { flushPending, settleReduxBatching } from '@shared/test/flush';
import { tasksApi } from './tasks.api';

import type { ListTasksArgs } from './tasks.api';
import type { Task } from '@shared/types/task';
import type { FetchStub } from '@shared/test/fetch-stub';
import type { AppStore } from '@store/create-store';

/** Builds a task with sensible defaults, overridable per test. */
function task(overrides: Partial<Task> = {}): Task {
  return {
    id: 't1',
    title: 'Renew passport',
    priority: 'HIGH',
    status: 'TODO',
    tags: [],
    dueAt: '2026-08-01T09:00:00.000Z',
    scheduledAt: null,
    completedAt: null,
    createdAt: '2026-07-30T00:00:00.000Z',
    updatedAt: '2026-07-30T00:00:00.000Z',
    ...overrides,
  };
}

/** A list envelope in the API's shape. */
function page(tasks: Task[]) {
  return {
    data: tasks,
    meta: { total: tasks.length, page: 1, limit: 50, hasMore: false },
  };
}

/**
 * Non-empty list args, on purpose.
 *
 * ⚠️ The optimistic updates locate cache entries via `selectInvalidatedBy` rather
 * than assuming `undefined` args. Fetching with real args here is what makes that
 * distinction testable — with `undefined` a hardcoded-args implementation would
 * pass these tests and still fail in the app, which is exactly the bug the design
 * exists to avoid.
 */
const LIST_ARGS: ListTasksArgs = { sort: 'dueAt', order: 'asc' };

/** The cached list rows, as the screen would see them. */
function cachedRows(store: AppStore): Task[] | undefined {
  return tasksApi.endpoints.listTasks.select(LIST_ARGS)(store.getState()).data
    ?.data;
}

/** The cached total, which the header renders. */
function cachedTotal(store: AppStore): number | undefined {
  return tasksApi.endpoints.listTasks.select(LIST_ARGS)(store.getState()).data
    ?.meta.total;
}

let stub: FetchStub;

/** Every store a test built, so they can all be torn down together. */
const stores: AppStore[] = [];

/** Live query subscriptions, which must be released before the stores reset. */
const subscriptions: Array<{ unsubscribe: () => void }> = [];

afterEach(() => {
  subscriptions.forEach((subscription) => subscription.unsubscribe());
  subscriptions.length = 0;
  stores.forEach((store) => store.dispatch(tasksApi.util.resetApiState()));
  stores.length = 0;
  stub.restore();
});

// Redux's own batching timers outlive the suite otherwise. See the note on
// `settleReduxBatching` for why unsubscribing and resetting are not enough.
afterAll(settleReduxBatching);

/** Loads the list into cache so optimistic updates have something to patch. */
async function seedList(tasks: Task[]) {
  const store = createTestStore();
  stores.push(store);
  const subscription = store.dispatch(
    tasksApi.endpoints.listTasks.initiate(LIST_ARGS),
  );
  subscriptions.push(subscription);
  await subscription;
  expect(cachedRows(store)).toHaveLength(tasks.length);
  return store;
}

describe('listTasks', () => {
  it('sends the query args and caches the envelope', async () => {
    stub = stubFetch(() =>
      jsonResponse(200, page([task(), task({ id: 't2' })])),
    );
    const store = await seedList([task(), task({ id: 't2' })]);

    const [call] = stub.callsTo('/tasks');
    expect(call.method).toBe('GET');
    expect(call.url).toContain('sort=dueAt');
    expect(call.url).toContain('order=asc');
    expect(cachedTotal(store)).toBe(2);
  });
});

describe('toggleTask', () => {
  it('flips the row before the server answers, then keeps it', async () => {
    const gate = createDeferred<void>();
    stub = stubFetch(async (call) => {
      if (call.url.includes('/toggle')) {
        await gate.promise;
        return jsonResponse(200, task({ status: 'DONE' }));
      }
      return jsonResponse(200, page([task()]));
    });

    const store = await seedList([task()]);

    const pending = store.dispatch(
      tasksApi.endpoints.toggleTask.initiate(task()),
    );
    await flushPending();

    // The whole point of the optimistic patch: the checkbox has already moved
    // while the request is still in flight.
    expect(cachedRows(store)?.[0].status).toBe('DONE');
    expect(cachedRows(store)?.[0].completedAt).not.toBeNull();

    gate.resolve();
    await pending;
    expect(cachedRows(store)?.[0].status).toBe('DONE');
  });

  it('rolls the row back when the server rejects it', async () => {
    stub = stubFetch((call) =>
      call.url.includes('/toggle')
        ? errorResponse(500, 'INTERNAL_ERROR')
        : jsonResponse(200, page([task()])),
    );

    const store = await seedList([task()]);
    await store.dispatch(tasksApi.endpoints.toggleTask.initiate(task()));

    // Snapping back is the honest outcome — leaving it ticked would show a
    // completion the server never accepted, and the next refetch would undo it
    // anyway, with no explanation.
    expect(cachedRows(store)?.[0].status).toBe('TODO');
    expect(cachedRows(store)?.[0].completedAt).toBeNull();
  });

  it('un-completes a DONE task and clears its completedAt', async () => {
    const done = task({ status: 'DONE', completedAt: '2026-07-30T10:00:00Z' });
    stub = stubFetch((call) =>
      call.url.includes('/toggle')
        ? jsonResponse(200, task())
        : jsonResponse(200, page([done])),
    );

    const store = await seedList([done]);
    await store.dispatch(tasksApi.endpoints.toggleTask.initiate(done));

    expect(cachedRows(store)?.[0].status).toBe('TODO');
    expect(cachedRows(store)?.[0].completedAt).toBeNull();
  });

  it('posts to /toggle with no body — the server owns the transition', async () => {
    stub = stubFetch((call) =>
      call.url.includes('/toggle')
        ? jsonResponse(200, task({ status: 'DONE' }))
        : jsonResponse(200, page([task()])),
    );

    const store = await seedList([task()]);
    await store.dispatch(tasksApi.endpoints.toggleTask.initiate(task()));

    const [call] = stub.callsTo('/toggle');
    expect(call.method).toBe('POST');
    // Sending a status would put the definition of "done" in a second place,
    // derived from a row that may already be stale.
    expect(call.body).toBeUndefined();
  });
});

describe('deleteTask', () => {
  it('removes the row immediately and keeps the count honest', async () => {
    const gate = createDeferred<void>();
    const rows = [task(), task({ id: 't2', title: 'Book dentist' })];
    stub = stubFetch(async (call) => {
      if (call.method === 'DELETE') {
        await gate.promise;
        return new Response(null, { status: 204 });
      }
      return jsonResponse(200, page(rows));
    });

    const store = await seedList(rows);

    const pending = store.dispatch(
      tasksApi.endpoints.deleteTask.initiate('t1'),
    );
    await flushPending();

    expect(cachedRows(store)?.map((row) => row.id)).toEqual(['t2']);
    // Left stale, the header would read "2 tasks" above a list of one.
    expect(cachedTotal(store)).toBe(1);

    gate.resolve();
    await pending;
  });

  /**
   * ⚠️ `DELETE /tasks/:id` answers **204 No Content**.
   *
   * `fetchBaseQuery` runs its JSON response handler over an empty body; if that
   * were treated as a parse failure the mutation would reject, the optimistic
   * removal would roll back, and the row would reappear a moment after the user
   * deleted it — with the task already gone on the server.
   */
  it('treats the 204 empty body as success, not a parse failure', async () => {
    stub = stubFetch((call) =>
      call.method === 'DELETE'
        ? new Response(null, { status: 204 })
        : jsonResponse(200, page([task()])),
    );

    const store = await seedList([task()]);
    const result = await store.dispatch(
      tasksApi.endpoints.deleteTask.initiate('t1'),
    );

    expect('error' in result).toBe(false);
    expect(cachedRows(store)).toHaveLength(0);
  });

  it('puts the row back when the delete fails', async () => {
    const rows = [task(), task({ id: 't2' })];
    stub = stubFetch((call) =>
      call.method === 'DELETE'
        ? errorResponse(500, 'INTERNAL_ERROR')
        : jsonResponse(200, page(rows)),
    );

    const store = await seedList(rows);
    await store.dispatch(tasksApi.endpoints.deleteTask.initiate('t1'));

    expect(cachedRows(store)?.map((row) => row.id)).toEqual(['t1', 't2']);
    expect(cachedTotal(store)).toBe(2);
  });
});

describe('createTask and updateTask', () => {
  it('creates with the given body and refetches the list', async () => {
    stub = stubFetch((call) =>
      call.method === 'POST'
        ? jsonResponse(201, task({ id: 'new' }))
        : jsonResponse(200, page([task()])),
    );

    const store = await seedList([task()]);
    await store.dispatch(
      tasksApi.endpoints.createTask.initiate({
        title: 'Write the README',
        priority: 'URGENT',
      }),
    );
    await flushPending();

    const [created] = stub.callsTo('/tasks').filter((c) => c.method === 'POST');
    expect(created.body).toEqual({
      title: 'Write the README',
      priority: 'URGENT',
    });

    // Invalidation, not an optimistic insert: the server assigns the id, and a
    // list refetch is the only way the new row arrives with one.
    expect(stub.calls.filter((c) => c.method === 'GET')).toHaveLength(2);
  });

  it('patches only the fields it was given', async () => {
    stub = stubFetch((call) =>
      call.method === 'PATCH'
        ? jsonResponse(200, task({ title: 'Renew passport urgently' }))
        : jsonResponse(200, page([task()])),
    );

    const store = await seedList([task()]);
    await store.dispatch(
      tasksApi.endpoints.updateTask.initiate({
        id: 't1',
        patch: { title: 'Renew passport urgently' },
      }),
    );

    const [call] = stub.calls.filter((c) => c.method === 'PATCH');
    expect(call.url).toContain('/tasks/t1');
    expect(call.body).toEqual({ title: 'Renew passport urgently' });
  });

  it('can clear a date with an explicit null', async () => {
    stub = stubFetch((call) =>
      call.method === 'PATCH'
        ? jsonResponse(200, task({ dueAt: null }))
        : jsonResponse(200, page([task()])),
    );

    const store = await seedList([task()]);
    await store.dispatch(
      tasksApi.endpoints.updateTask.initiate({
        id: 't1',
        patch: { dueAt: null },
      }),
    );

    const [call] = stub.calls.filter((c) => c.method === 'PATCH');
    // `undefined` would be dropped by JSON.stringify and read as "leave it alone",
    // so removing a deadline would silently do nothing.
    expect(call.body).toEqual({ dueAt: null });
  });
});

describe('restoreTask', () => {
  it('posts to /restore and refetches', async () => {
    stub = stubFetch((call) =>
      call.url.includes('/restore')
        ? jsonResponse(200, task())
        : jsonResponse(200, page([])),
    );

    const store = await seedList([]);
    await store.dispatch(tasksApi.endpoints.restoreTask.initiate('t1'));

    const [call] = stub.callsTo('/restore');
    expect(call.method).toBe('POST');
    expect(call.url).toContain('/tasks/t1/restore');
  });
});
