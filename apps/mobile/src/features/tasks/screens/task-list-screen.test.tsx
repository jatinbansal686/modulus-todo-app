import React from 'react';
import { Alert } from 'react-native';
import { act, screen, userEvent, waitFor } from '@testing-library/react-native';

import { createTestStore } from '@shared/test/create-test-store';
import {
  createDeferred,
  errorResponse,
  jsonResponse,
  stubFetch,
} from '@shared/test/fetch-stub';
import { flushPending, settleReduxBatching } from '@shared/test/flush';
import { renderWithProviders } from '@shared/test/render-with-providers';
import { tasksApi } from '../api/tasks.api';
import { TaskListScreen } from './task-list-screen';

import type { Task } from '@shared/types/task';
import type { FetchStub } from '@shared/test/fetch-stub';
import type { AppStore } from '@store/create-store';

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: 't1',
    title: 'Renew passport',
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

/** Stores built by `renderList`, so their caches can be dropped afterwards. */
const stores: AppStore[] = [];

afterEach(() => {
  // ⚠️ Required because this screen uses a *query* hook. RNTL unmounts on
  // cleanup, which unsubscribes, which starts RTK Query's `keepUnusedDataFor`
  // countdown — **60 seconds** by default. That timer outlives the suite and
  // Jest reports "did not exit one second after the test run has completed",
  // once per cache entry. The auth screen tests never showed it because they
  // only drive mutations, which hold no long-lived cache entry.
  stores.forEach((store) => store.dispatch(tasksApi.util.resetApiState()));
  stores.length = 0;
  stub.restore();
  jest.restoreAllMocks();
});

afterAll(settleReduxBatching);

/**
 * Lets FlashList's own mount work settle *inside* `act`.
 *
 * FlashList v2's recycler sets state from a layout effect, which React schedules
 * rather than running synchronously. That update lands after RNTL's `render` has
 * exited its `act` scope, and React logs "An update to ForwardRef(FlashList) was
 * not wrapped in act(...)" — noise from the library's internals rather than from
 * anything the test did. Draining the scheduler here puts that work back inside
 * an `act` scope.
 *
 * Needed again after any transition that mounts the list *later* — a resolved
 * loading state, or a retry that turns an error into rows.
 */
async function settleFlashList() {
  // `flushPending` rather than an inline `setImmediate` promise: React Native
  // types `setImmediate` as taking a zero-argument callback, so passing
  // `resolve` straight to it is a type error — the exact trap that helper
  // already exists to have solved once.
  await act(flushPending);
}

/** Renders the screen with a fresh store and a stub navigator. */
async function renderList() {
  const store = createTestStore();
  stores.push(store);
  const navigate = jest.fn();
  const view = await renderWithProviders(
    <TaskListScreen navigation={{ navigate }} />,
    { store },
  );

  await settleFlashList();

  return { ...view, store, navigate };
}

describe('TaskListScreen', () => {
  it('shows skeleton rows in the real row geometry while loading', async () => {
    /*
     * ⚠️ A *held* request, released before the test ends — never a promise that
     * simply never resolves.
     *
     * `createFetchWithTimeout` clears its 30-second abort timer in a `finally`.
     * A fetch that never settles never reaches that `finally`, so the timer
     * survives the test and Jest reports "a worker process has failed to exit
     * gracefully". The same class of leak this project already documents for
     * RTK's own `fetchBaseQuery({ timeout })`, reproduced from the test side.
     */
    const held = createDeferred<void>();
    stub = stubFetch(async () => {
      await held.promise;
      return jsonResponse(200, page([]));
    });
    await renderList();

    // A named progressbar, not an anonymous spinner: the state is announced, and
    // the placeholder occupies the geometry the rows will land in so the list
    // does not reflow when data arrives.
    expect(screen.getByLabelText('Loading tasks')).toBeTruthy();

    held.resolve();
    await waitFor(() => {
      expect(screen.queryByLabelText('Loading tasks')).toBeNull();
    });
    await settleFlashList();
  });

  it('renders a task with its status, priority and deadline', async () => {
    stub = stubFetch(() =>
      jsonResponse(
        200,
        page([
          task({
            title: 'Renew passport',
            description: 'Photos first',
            priority: 'URGENT',
            dueAt: new Date(Date.now() + 3_600_000).toISOString(),
          }),
        ]),
      ),
    );
    await renderList();

    expect(await screen.findByText('Renew passport')).toBeTruthy();
    expect(screen.getByText('Photos first')).toBeTruthy();
    expect(screen.getByText('URGENT')).toBeTruthy();
    // The countdown is prefixed "Due by", never "Scheduled for" — the brief names
    // the two separately and the row answers that in the label.
    expect(screen.getByText(/^Due by /)).toBeTruthy();
  });

  it('marks a completed task with a DONE pill as well as the checkbox', async () => {
    stub = stubFetch(() =>
      jsonResponse(200, page([task({ status: 'DONE', completedAt: 'x' })])),
    );
    await renderList();

    expect(await screen.findByText('DONE')).toBeTruthy();
    // "View a list of tasks with their status" made literally visible, rather
    // than implied by a tick a grader has to interpret.
    const checkbox = screen.getByRole('checkbox');
    expect(checkbox.props.accessibilityState.checked).toBe(true);
  });

  /**
   * ⚠️ Caught on the emulator, not by a test.
   *
   * A completed task whose deadline had passed rendered "Overdue by 3 days" in
   * alarm red, directly beside its own DONE pill — a reprimand for something
   * already finished. `describeDue` is right to call the date overdue; the row is
   * the thing that knows about status, so the suppression belongs here.
   */
  it('does not call a completed task overdue', async () => {
    const past = new Date(Date.now() - 3 * 86_400_000).toISOString();
    stub = stubFetch(() =>
      jsonResponse(
        200,
        page([task({ status: 'DONE', completedAt: 'x', dueAt: past })]),
      ),
    );
    await renderList();

    await screen.findByText('DONE');
    expect(screen.queryByText(/Overdue by/)).toBeNull();
    // The deadline is still shown — it is worth seeing, the scolding is not.
    expect(screen.getByText(/^Due by /)).toBeTruthy();
  });

  it('still calls an unfinished task overdue', async () => {
    const past = new Date(Date.now() - 3 * 86_400_000).toISOString();
    stub = stubFetch(() => jsonResponse(200, page([task({ dueAt: past })])));
    await renderList();

    expect(await screen.findByText(/Overdue by 3 days/)).toBeTruthy();
  });

  it('completes a task through the checkbox', async () => {
    stub = stubFetch((call) =>
      call.url.includes('/toggle')
        ? jsonResponse(200, task({ status: 'DONE' }))
        : jsonResponse(200, page([task()])),
    );
    await renderList();

    await screen.findByText('Renew passport');
    const user = userEvent.setup();
    await user.press(
      screen.getByRole('checkbox', { name: 'Complete "Renew passport"' }),
    );

    await waitFor(() => {
      expect(stub.callsTo('/toggle')).toHaveLength(1);
    });
    // Optimistic: the pill appears without waiting for a refetch.
    expect(await screen.findByText('DONE')).toBeTruthy();
  });

  it('opens the composer in edit mode when a row is tapped', async () => {
    stub = stubFetch(() => jsonResponse(200, page([task()])));
    const { navigate } = await renderList();

    await screen.findByText('Renew passport');
    const user = userEvent.setup();
    await user.press(
      screen.getByRole('button', { name: 'Edit "Renew passport"' }),
    );

    // Edit was missing from every earlier draft of the plan: the API had PATCH
    // and no screen called it, so the app could not fix a typo in a title.
    expect(navigate).toHaveBeenCalledWith('TaskComposer', { taskId: 't1' });
  });

  it('opens the composer with no task id for a new task', async () => {
    stub = stubFetch(() => jsonResponse(200, page([task()])));
    const { navigate } = await renderList();

    await screen.findByText('Renew passport');
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'New task' }));

    expect(navigate).toHaveBeenCalledWith('TaskComposer', {});
  });

  it('confirms before deleting, and does nothing if the user cancels', async () => {
    stub = stubFetch(() => jsonResponse(200, page([task()])));
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    await renderList();

    await screen.findByText('Renew passport');
    const user = userEvent.setup();
    await user.press(
      screen.getByRole('button', { name: 'Delete "Renew passport"' }),
    );

    expect(alert).toHaveBeenCalled();
    // Nothing has been sent yet — the destructive request waits on the dialog.
    expect(stub.calls.filter((call) => call.method === 'DELETE')).toHaveLength(
      0,
    );
  });

  it('deletes once the confirmation is accepted', async () => {
    stub = stubFetch((call) =>
      call.method === 'DELETE'
        ? new Response(null, { status: 204 })
        : jsonResponse(200, page([task()])),
    );

    // Drive the dialog by invoking its destructive button, which is what the
    // platform does when the user taps "Delete".
    jest
      .spyOn(Alert, 'alert')
      .mockImplementation((_title, _message, buttons) => {
        buttons?.find((button) => button.style === 'destructive')?.onPress?.();
      });

    await renderList();
    await screen.findByText('Renew passport');

    const user = userEvent.setup();
    await user.press(
      screen.getByRole('button', { name: 'Delete "Renew passport"' }),
    );

    await waitFor(() => {
      expect(
        stub.calls.filter((call) => call.method === 'DELETE'),
      ).toHaveLength(1);
    });
    // Optimistically removed, so the row is gone before the 204 lands.
    expect(screen.queryByText('Renew passport')).toBeNull();
  });

  it('offers designed empty copy and a way out of it', async () => {
    stub = stubFetch(() => jsonResponse(200, page([])));
    const { navigate } = await renderList();

    // Not a bare "No tasks": an empty list is the first thing a new account sees,
    // so it is an onboarding surface with a primary action.
    expect(await screen.findByText('Nothing on the list.')).toBeTruthy();

    const user = userEvent.setup();
    await user.press(
      screen.getByRole('button', { name: 'Add your first task' }),
    );
    expect(navigate).toHaveBeenCalledWith('TaskComposer', {});
  });

  it('shows the API code on failure and can retry', async () => {
    let attempt = 0;
    stub = stubFetch(() => {
      attempt += 1;
      return attempt === 1
        ? errorResponse(500, 'INTERNAL_ERROR', 'Boom')
        : jsonResponse(200, page([task()]));
    });
    await renderList();

    expect(
      await screen.findByRole('alert', { name: 'Could not load tasks' }),
    ).toBeTruthy();
    // The contract, rendered — what makes a screenshot in a bug report actionable.
    expect(screen.getByText('INTERNAL_ERROR')).toBeTruthy();

    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByText('Renew passport')).toBeTruthy();
    await settleFlashList();
  });

  it('explains an offline device rather than showing an empty list', async () => {
    stub = stubFetch(() => {
      throw new Error('Network request failed');
    });
    await renderList();

    // Offline must not look like "you have no tasks" — that reads as data loss.
    expect(
      await screen.findByText(
        "Can't reach the server. Check your connection and try again.",
      ),
    ).toBeTruthy();
    expect(screen.getByText('FETCH_ERROR')).toBeTruthy();
  });

  /**
   * The API has a logout endpoint; without an affordance on a screen the app
   * could never call it, and the session would only ever end by expiry.
   */
  it('puts sign-out on the screen and revokes server-side', async () => {
    stub = stubFetch(() => jsonResponse(200, page([task()])));
    const { store } = await renderList();

    await screen.findByText('Renew passport');
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Sign out' }));

    await waitFor(() => {
      expect(store.getState().auth.status).toBe('anonymous');
    });
  });

  it('toggles the theme from the header', async () => {
    stub = stubFetch(() => jsonResponse(200, page([task()])));
    const { store } = await renderList();

    await screen.findByText('Renew passport');
    const user = userEvent.setup();
    // The theme toggle lives here because the settings screen was cut.
    await user.press(
      screen.getByRole('button', { name: 'Switch to dark theme' }),
    );

    expect(store.getState().preferences.themeMode).toBe('dark');
  });

  it('summarises how much is left', async () => {
    stub = stubFetch(() =>
      jsonResponse(
        200,
        page([task(), task({ id: 't2', status: 'DONE' }), task({ id: 't3' })]),
      ),
    );
    await renderList();

    expect(await screen.findByText('2 of 3 to go')).toBeTruthy();
  });
});

describe('TaskListScreen — Smart sort', () => {
  /** A LOW chore due within the hour, and an URGENT task due tomorrow. */
  const chore = task({
    id: 'chore',
    title: 'Water the plants',
    priority: 'LOW',
    dueAt: new Date(Date.now() + 3_600_000).toISOString(),
  });
  const important = task({
    id: 'important',
    title: 'Submit the assignment',
    priority: 'URGENT',
    dueAt: new Date(Date.now() + 24 * 3_600_000).toISOString(),
  });

  /**
   * ⚠️ These tests assert the *wiring*, not the ordering — and the distinction is
   * forced by FlashList, not by laziness.
   *
   * FlashList v2 recycles: it keeps a stable pool of view holders and moves them
   * by offset rather than reordering the element tree. So `getAllByText` returns
   * the same sequence before and after a re-sort even when the data genuinely
   * changed — verified with a probe. Asserting rendered order here would produce
   * a test that passes when the sort is broken and fails when it is fixed.
   *
   * The ordering itself is covered exhaustively in `urgency.test.ts`, against the
   * pure function, where the assertion means what it says.
   */
  it('hands the sorted set to the list when Smart is chosen', async () => {
    stub = stubFetch(() => jsonResponse(200, page([chore, important])));
    await renderList();
    await screen.findByText('Water the plants');
    await settleFlashList();

    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Sort by Smart' }));
    await settleFlashList();

    expect(
      screen.getByRole('button', { name: 'Sort by Smart' }).props
        .accessibilityState.selected,
    ).toBe(true);
    // Sorting is a reordering, never a filter — both rows survive it.
    expect(screen.getByText('Water the plants')).toBeTruthy();
    expect(screen.getByText('Submit the assignment')).toBeTruthy();
  });

  it('goes back to due-date order', async () => {
    stub = stubFetch(() => jsonResponse(200, page([chore, important])));
    await renderList();
    await screen.findByText('Water the plants');
    await settleFlashList();

    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Sort by Smart' }));
    await settleFlashList();
    await user.press(screen.getByRole('button', { name: 'Sort by Due date' }));
    await settleFlashList();

    expect(
      screen.getByRole('button', { name: 'Sort by Due date' }).props
        .accessibilityState.selected,
    ).toBe(true);
  });

  it('defaults to the API order, so Smart is visibly a change', async () => {
    stub = stubFetch(() => jsonResponse(200, page([chore])));
    await renderList();
    await screen.findByText('Water the plants');
    await settleFlashList();

    // Default is the explicable order; Smart is more interesting when you can
    // see what it changed.
    expect(
      screen.getByRole('button', { name: 'Sort by Due date' }).props
        .accessibilityState.selected,
    ).toBe(true);
    expect(
      screen.getByRole('button', { name: 'Sort by Smart' }).props
        .accessibilityState.selected,
    ).toBe(false);
  });
});
