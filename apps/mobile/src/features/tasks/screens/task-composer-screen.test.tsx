import React from 'react';
import {
  fireEvent,
  screen,
  userEvent,
  waitFor,
} from '@testing-library/react-native';

import { createTestStore } from '@shared/test/create-test-store';
import {
  errorResponse,
  jsonResponse,
  stubFetch,
} from '@shared/test/fetch-stub';
import { settleReduxBatching } from '@shared/test/flush';
import { renderWithProviders } from '@shared/test/render-with-providers';
import { tasksApi } from '../api/tasks.api';
import { TaskComposerScreen } from './task-composer-screen';

import type { Task } from '@shared/types/task';
import type { FetchStub } from '@shared/test/fetch-stub';
import type { AppStore } from '@store/create-store';

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: 't1',
    title: 'Renew passport',
    description: 'Photos first',
    priority: 'HIGH',
    status: 'TODO',
    tags: [],
    dueAt: null,
    scheduledAt: null,
    completedAt: null,
    createdAt: '2026-07-30T00:00:00.000Z',
    updatedAt: '2026-07-30T00:00:00.000Z',
    ...overrides,
  };
}

function page(tasks: Task[]) {
  return {
    data: tasks,
    meta: { total: tasks.length, page: 1, limit: 50, hasMore: false },
  };
}

let stub: FetchStub;
const subscriptions: Array<{ unsubscribe: () => void }> = [];
const stores: AppStore[] = [];

afterEach(() => {
  subscriptions.forEach((subscription) => subscription.unsubscribe());
  subscriptions.length = 0;
  stores.forEach((store) => store.dispatch(tasksApi.util.resetApiState()));
  stores.length = 0;
  stub.restore();
});

afterAll(settleReduxBatching);

/**
 * Renders the composer.
 *
 * `params` is the route's params — `{}` creates, `{ taskId }` edits. `seed`
 * places tasks in the list cache first, which is where edit mode reads the task
 * it is editing from.
 */
async function renderComposer(
  params: { taskId?: string } = {},
  seed: Task[] | null = null,
) {
  const store = createTestStore();
  stores.push(store);

  if (seed) {
    const subscription = store.dispatch(
      tasksApi.endpoints.listTasks.initiate({ sort: 'dueAt', order: 'asc' }),
    );
    subscriptions.push(subscription);
    await subscription;
  }

  const goBack = jest.fn();
  const view = await renderWithProviders(
    <TaskComposerScreen navigation={{ goBack }} route={{ params }} />,
    { store },
  );
  return { ...view, store, goBack };
}

/** The single POST or PATCH the composer sent. */
function submittedBody(method: 'POST' | 'PATCH') {
  const [call] = stub.calls.filter((candidate) => candidate.method === method);
  return call.body as Record<string, unknown>;
}

async function press(name: string) {
  const user = userEvent.setup();
  await user.press(screen.getByRole('button', { name }));
}

describe('TaskComposerScreen — creating', () => {
  it('creates a task from a title alone', async () => {
    stub = stubFetch((call) =>
      call.method === 'POST'
        ? jsonResponse(201, task())
        : jsonResponse(200, page([])),
    );
    const { goBack } = await renderComposer();

    expect(screen.getByText('New task')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Title'), 'Buy milk');
    await press('Add task');

    await waitFor(() => {
      expect(stub.calls.filter((call) => call.method === 'POST')).toHaveLength(
        1,
      );
    });
    // A title is genuinely all it takes — the empty state promises exactly that.
    expect(submittedBody('POST')).toEqual({
      title: 'Buy milk',
      priority: 'MEDIUM',
    });
    // Dismisses only after the server accepted it.
    expect(goBack).toHaveBeenCalled();
  });

  it('refuses an empty title without troubling the API', async () => {
    stub = stubFetch(() => jsonResponse(200, page([])));
    const { goBack } = await renderComposer();

    await press('Add task');

    expect(await screen.findByText('Give the task a title')).toBeTruthy();
    expect(stub.calls.filter((call) => call.method === 'POST')).toHaveLength(0);
    expect(goBack).not.toHaveBeenCalled();
  });

  it('trims the title rather than storing the whitespace', async () => {
    stub = stubFetch((call) =>
      call.method === 'POST'
        ? jsonResponse(201, task())
        : jsonResponse(200, page([])),
    );
    await renderComposer();

    await fireEvent.changeText(screen.getByLabelText('Title'), '  Buy milk  ');
    await press('Add task');

    await waitFor(() => {
      expect(submittedBody('POST').title).toBe('Buy milk');
    });
  });

  it('sends the chosen priority', async () => {
    stub = stubFetch((call) =>
      call.method === 'POST'
        ? jsonResponse(201, task())
        : jsonResponse(200, page([])),
    );
    await renderComposer();

    await fireEvent.changeText(screen.getByLabelText('Title'), 'Ship it');
    await press('Priority URGENT');
    await press('Add task');

    await waitFor(() => {
      expect(submittedBody('POST').priority).toBe('URGENT');
    });
  });

  /**
   * ⚠️ The trap the brief deliberately planted.
   *
   * "Date-time" and "deadline" are separate fields that users conflate. The two
   * chip rows are labelled distinctly and write to distinct fields; this pins
   * that a tap on one never lands in the other.
   */
  it('keeps "Scheduled for" and "Due by" as separate fields', async () => {
    stub = stubFetch((call) =>
      call.method === 'POST'
        ? jsonResponse(201, task())
        : jsonResponse(200, page([])),
    );
    await renderComposer();

    await fireEvent.changeText(screen.getByLabelText('Title'), 'Two dates');
    await press('Scheduled for: Tomorrow 9am');
    await press('Due by: This weekend');
    await press('Add task');

    await waitFor(() => {
      expect(stub.calls.filter((call) => call.method === 'POST')).toHaveLength(
        1,
      );
    });

    const body = submittedBody('POST');
    expect(typeof body.scheduledAt).toBe('string');
    expect(typeof body.dueAt).toBe('string');
    // Different chips, different instants — a shared handler would collapse them.
    expect(body.scheduledAt).not.toBe(body.dueAt);
  });

  it('renders one tap of a quick chip as a readable date', async () => {
    stub = stubFetch(() => jsonResponse(200, page([])));
    await renderComposer();

    // Before: nothing set on either field.
    expect(screen.getAllByText('Not set')).toHaveLength(2);

    await press('Due by: Tomorrow 9am');

    // One tap replaces the stock Android date dialog *and* its separate time
    // dialog — the whole reason the chip row exists.
    expect(screen.getAllByText('Not set')).toHaveLength(1);
    expect(screen.getByText(/9:00 AM$/)).toBeTruthy();
  });

  it('can clear a date it just set', async () => {
    stub = stubFetch(() => jsonResponse(200, page([])));
    await renderComposer();

    await press('Due by: Tonight');
    expect(screen.getAllByText('Not set')).toHaveLength(1);

    await press('Clear Due by');
    expect(screen.getAllByText('Not set')).toHaveLength(2);
  });

  it('shows the API code and stays open when creation fails', async () => {
    stub = stubFetch((call) =>
      call.method === 'POST'
        ? errorResponse(400, 'VALIDATION_FAILED', 'Validation failed')
        : jsonResponse(200, page([])),
    );
    const { goBack } = await renderComposer();

    await fireEvent.changeText(screen.getByLabelText('Title'), 'Buy milk');
    await press('Add task');

    expect(
      await screen.findByRole('alert', { name: 'Could not create' }),
    ).toBeTruthy();
    expect(screen.getByText('VALIDATION_FAILED')).toBeTruthy();
    // Staying open is the point: dismissing would hide the error and silently
    // discard what the user typed.
    expect(goBack).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Title').props.value).toBe('Buy milk');
  });
});

describe('TaskComposerScreen — editing', () => {
  /**
   * Edit is the requirement that was missing from every earlier draft of the plan:
   * the API shipped `PATCH /tasks/:id` and no screen consumed it, so the app could
   * not fix a typo in a task title.
   */
  it('prefills from the cached task and patches it', async () => {
    stub = stubFetch((call) =>
      call.method === 'PATCH'
        ? jsonResponse(200, task({ title: 'Renew passport soon' }))
        : jsonResponse(200, page([task()])),
    );
    const { goBack } = await renderComposer({ taskId: 't1' }, [task()]);

    expect(screen.getByText('Edit task')).toBeTruthy();
    // Read from the list cache rather than re-fetched: the row is already on
    // screen behind the modal.
    expect(screen.getByLabelText('Title').props.value).toBe('Renew passport');
    expect(screen.getByLabelText('Notes').props.value).toBe('Photos first');

    await fireEvent.changeText(
      screen.getByLabelText('Title'),
      'Renew passport soon',
    );
    await press('Save changes');

    await waitFor(() => {
      expect(stub.calls.filter((call) => call.method === 'PATCH')).toHaveLength(
        1,
      );
    });
    expect(submittedBody('PATCH').title).toBe('Renew passport soon');
    expect(goBack).toHaveBeenCalled();
  });

  it('clears a deadline with an explicit null rather than omitting it', async () => {
    const withDue = task({ dueAt: '2026-08-01T09:00:00.000Z' });
    stub = stubFetch((call) =>
      call.method === 'PATCH'
        ? jsonResponse(200, task({ dueAt: null }))
        : jsonResponse(200, page([withDue])),
    );
    await renderComposer({ taskId: 't1' }, [withDue]);

    await press('Clear Due by');
    await press('Save changes');

    await waitFor(() => {
      expect(stub.calls.filter((call) => call.method === 'PATCH')).toHaveLength(
        1,
      );
    });
    // `undefined` would be dropped by JSON.stringify and read as "leave it
    // alone", so removing a deadline would silently do nothing.
    expect(submittedBody('PATCH').dueAt).toBeNull();
  });

  it('closes without saving when dismissed', async () => {
    stub = stubFetch(() => jsonResponse(200, page([task()])));
    const { goBack } = await renderComposer({ taskId: 't1' }, [task()]);

    await press('Close');

    expect(goBack).toHaveBeenCalled();
    expect(stub.calls.filter((call) => call.method === 'PATCH')).toHaveLength(
      0,
    );
  });
});
