import { api } from '@shared/api/api';
import { TaskStatus } from '@shared/types/task';

import type { Paginated } from '@shared/api/types';
import type { Task, TaskPriority } from '@shared/types/task';

/**
 * The reversible handle `updateQueryData` hands back when dispatched.
 *
 * Declared structurally rather than imported: RTK Query's own `PatchCollection`
 * is declared but **not exported** from `@reduxjs/toolkit/query`, and reaching
 * into its internals would couple this file to an unpublished type. Rollback is
 * the only capability used here, so that is all this promises.
 */
interface UndoablePatch {
  undo: () => void;
}

/** Query string for `GET /tasks`. Every field optional; the API defaults them. */
export interface ListTasksArgs {
  status?: TaskStatus;
  priority?: TaskPriority;
  tag?: string;
  sort?: 'dueAt' | 'createdAt' | 'priority' | 'title';
  order?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}

/** Body for `POST /tasks`. */
export interface CreateTaskInput {
  title: string;
  description?: string;
  scheduledAt?: string;
  dueAt?: string;
  priority?: TaskPriority;
  tags?: string[];
}

/**
 * Body for `PATCH /tasks/:id`. Every field optional, plus `status`.
 *
 * ⚠️ The date fields are `Omit`ted from the inherited half before being redeclared
 * as nullable. Intersecting instead — `Partial<CreateTaskInput> & { dueAt?: string
 * | null }` — looks equivalent and is not: an intersection of two property types
 * is their *overlap*, so `dueAt` would resolve back to `string | undefined` and
 * `{ dueAt: null }` would fail to compile at every call site.
 *
 * The distinction being protected is real: explicit `null` clears a date, while
 * `undefined` leaves it untouched. "Remove the deadline" and "don't change the
 * deadline" are different requests, and `undefined` cannot express both.
 */
export type UpdateTaskInput = Partial<
  Omit<CreateTaskInput, 'scheduledAt' | 'dueAt'>
> & {
  status?: TaskStatus;
  scheduledAt?: string | null;
  dueAt?: string | null;
};

/**
 * The tag every list cache carries.
 *
 * A single shared id rather than one per query-arg combination, so a newly created
 * task invalidates *every* cached list — including ones fetched with a filter it
 * happens to match.
 */
const LIST_TAG = { type: 'Task' as const, id: 'LIST' as const };

/**
 * Applies `recipe` to every cached `listTasks` result, whatever args produced it.
 *
 * ## Why this rather than `updateQueryData('listTasks', undefined, …)`
 *
 * `updateQueryData` targets one cache entry, identified by the *exact* args it was
 * fetched with. Hardcoding `undefined` there is the classic RTK Query optimistic-
 * update bug: the screen fetches with `{ sort: 'dueAt' }`, the patch targets the
 * `undefined` entry, nothing visible changes, and the row only updates when the
 * refetch lands — so the "optimistic" update silently becomes a slow one.
 *
 * `selectInvalidatedBy` asks the store which entries actually provide the tag, so
 * the patch follows the cache instead of guessing at it, and it keeps working when
 * filtering is added later.
 *
 * @returns Undo handles. Call `.undo()` on each if the request fails.
 */
function patchEveryCachedList(
  dispatch: (action: unknown) => unknown,
  getState: () => unknown,
  recipe: (draft: Paginated<Task>) => void,
): UndoablePatch[] {
  const entries = tasksApi.util.selectInvalidatedBy(getState() as never, [
    LIST_TAG,
  ]);

  return entries
    .filter((entry) => entry.endpointName === 'listTasks')
    .map(
      (entry) =>
        dispatch(
          tasksApi.util.updateQueryData(
            'listTasks',
            entry.originalArgs as ListTasksArgs | undefined,
            recipe,
          ),
        ) as unknown as UndoablePatch,
    );
}

/**
 * Task endpoints, injected into the shared API slice.
 *
 * Complete and delete are **optimistic**: the list updates on tap and rolls back if
 * the request fails. On a free-tier instance that can take a second to answer, a
 * checkbox that waits for the server reads as broken.
 *
 * Create and edit are deliberately *not* optimistic — they happen behind a modal
 * that dismisses on success, so there is no stale row to look at, and inventing a
 * client-side id for a task the server has not acknowledged buys nothing.
 *
 * @see apps/api/src/modules/tasks/tasks.controller.ts
 */
export const tasksApi = api.injectEndpoints({
  endpoints: (builder) => ({
    listTasks: builder.query<Paginated<Task>, ListTasksArgs | void>({
      query: (args) => ({ url: '/tasks', params: args ?? undefined }),

      // Per-task tags alongside the list tag, so a single task's mutation can
      // invalidate precisely, rather than every mutation refetching everything.
      providesTags: (result) =>
        result
          ? [
              ...result.data.map((task) => ({
                type: 'Task' as const,
                id: task.id,
              })),
              LIST_TAG,
            ]
          : [LIST_TAG],
    }),

    createTask: builder.mutation<Task, CreateTaskInput>({
      query: (body) => ({ url: '/tasks', method: 'POST', body }),
      invalidatesTags: [LIST_TAG],
    }),

    updateTask: builder.mutation<Task, { id: string; patch: UpdateTaskInput }>({
      query: ({ id, patch }) => ({
        url: `/tasks/${id}`,
        method: 'PATCH',
        body: patch,
      }),
      invalidatesTags: (_result, _error, { id }) => [
        { type: 'Task', id },
        LIST_TAG,
      ],
    }),

    /**
     * Flips a task between TODO and DONE.
     *
     * A dedicated endpoint rather than `PATCH { status }` because the server owns
     * the transition: it also sets or clears `completedAt`. Sending the status
     * from the client would mean the client deciding what "done" means, in a
     * second place, from a possibly stale row.
     */
    toggleTask: builder.mutation<Task, Task>({
      query: (task) => ({ url: `/tasks/${task.id}/toggle`, method: 'POST' }),

      onQueryStarted: async (task, { dispatch, getState, queryFulfilled }) => {
        const nextStatus =
          task.status === TaskStatus.DONE ? TaskStatus.TODO : TaskStatus.DONE;

        const patches = patchEveryCachedList(dispatch, getState, (draft) => {
          const row = draft.data.find((candidate) => candidate.id === task.id);
          if (!row) {
            return;
          }
          row.status = nextStatus;
          // Mirrors the server's own transition. Without it the row flips its
          // status but keeps a stale `completedAt`, and anything reading that
          // field renders a completion time for a task that is no longer done.
          row.completedAt =
            nextStatus === TaskStatus.DONE ? new Date().toISOString() : null;
        });

        try {
          await queryFulfilled;
        } catch {
          // Roll back every patch. The checkbox snaps back, which is the honest
          // outcome — the server did not accept the change.
          patches.forEach((patch) => patch.undo());
        }
      },

      // No `invalidatesTags`: the optimistic patch already holds the new value and
      // `queryFulfilled` confirms it. Invalidating would trigger a refetch that
      // repaints the identical row, costing a request per checkbox tap.
    }),

    /**
     * Deletes a task.
     *
     * A **soft** delete server-side (`deletedAt`), which is what makes the restore
     * below possible. The client does not need to know that; it matters only
     * because the id survives, so a restored task keeps its identity.
     *
     * ⚠️ Types as `null`, not `void`: the endpoint answers `204 No Content`, and
     * `fetchBaseQuery` turns an empty body into `null`.
     */
    deleteTask: builder.mutation<null, string>({
      query: (id) => ({ url: `/tasks/${id}`, method: 'DELETE' }),

      onQueryStarted: async (id, { dispatch, getState, queryFulfilled }) => {
        const patches = patchEveryCachedList(dispatch, getState, (draft) => {
          const index = draft.data.findIndex(
            (candidate) => candidate.id === id,
          );
          if (index === -1) {
            return;
          }
          draft.data.splice(index, 1);
          // Keep the count honest — the header reads from it, so leaving it stale
          // shows "5 tasks" above a list of four.
          draft.meta.total = Math.max(0, draft.meta.total - 1);
        });

        try {
          await queryFulfilled;
        } catch {
          patches.forEach((patch) => patch.undo());
        }
      },
    }),

    /**
     * Restores a soft-deleted task.
     *
     * Not yet wired to a screen — the undo affordance ships with swipe actions.
     * It lives here now because it is part of the delete contract rather than a
     * feature of the gesture: the server already keeps the row, and a delete path
     * with no documented way back is how "soft delete" quietly becomes permanent.
     */
    restoreTask: builder.mutation<Task, string>({
      query: (id) => ({ url: `/tasks/${id}/restore`, method: 'POST' }),
      invalidatesTags: (_result, _error, id) => [
        { type: 'Task', id },
        LIST_TAG,
      ],
    }),
  }),
});

export const {
  useListTasksQuery,
  useCreateTaskMutation,
  useUpdateTaskMutation,
  useToggleTaskMutation,
  useDeleteTaskMutation,
  useRestoreTaskMutation,
} = tasksApi;
