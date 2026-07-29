/**
 * Route map for the root stack.
 *
 * Declared as a type rather than inferred so `navigation.navigate('Foo')` is a
 * compile error for an unknown route, and so screen props get their params typed
 * without each screen re-declaring them.
 *
 * The full inventory — Login, Register, TaskList, TaskComposer — arrives with the
 * screens that implement it. Adding a route here before its screen exists would
 * produce a navigator that can be navigated into and render nothing.
 */
export type RootStackParamList = {
  /** Foundation/diagnostics screen. Replaced by the real app stack in later PRs. */
  Foundation: undefined;
};

declare global {
  namespace ReactNavigation {
    // React Navigation reads this interface to type the global `useNavigation()`
    // hook, so a screen can call it without importing the param list explicitly.
    interface RootParamList extends RootStackParamList {}
  }
}
