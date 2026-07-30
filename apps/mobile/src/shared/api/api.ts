import { createApi } from '@reduxjs/toolkit/query/react';

import { baseQueryWithReauth } from './base-query';

/**
 * The single RTK Query API slice.
 *
 * One slice, injected into by each feature, rather than one per feature: that keeps
 * a single cache and a single mental model, and it means tag invalidation works
 * across features without any cross-wiring.
 *
 * Endpoints are added by feature modules through `injectEndpoints`, so
 * `features/auth` and `features/tasks` stay self-contained and this file never grows
 * a list of imports that must be kept in sync with the feature folders.
 */
export const api = createApi({
  reducerPath: 'api',
  baseQuery: baseQueryWithReauth,

  /**
   * Cache tags.
   *
   * Declared up front, including `Task`, which nothing invalidates yet — RTK Query
   * warns at runtime about tags used but never declared, and declaring them here
   * means the tasks feature can be added without touching this file.
   */
  tagTypes: ['Task', 'Session'],

  endpoints: () => ({}),
});
