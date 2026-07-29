import { useDispatch, useSelector, useStore } from 'react-redux';

import type { AppDispatch, AppStore, RootState } from './create-store';

/**
 * Pre-typed Redux hooks.
 *
 * Every component uses these instead of the bare `react-redux` hooks so that
 * `useAppSelector` knows the state shape and `useAppDispatch` accepts thunks. The
 * `.withTypes` form is react-redux 9's replacement for the older hand-written
 * `TypedUseSelectorHook` alias.
 *
 * Note these import types from `./create-store`, never from `./index` — pulling in
 * the store singleton here would drag MMKV into every test that renders a component.
 */
export const useAppDispatch = useDispatch.withTypes<AppDispatch>();
export const useAppSelector = useSelector.withTypes<RootState>();
export const useAppStore = useStore.withTypes<AppStore>();
