/**
 * Route map for the root stack.
 *
 * Declared as a type rather than inferred so `navigation.navigate('Foo')` is a
 * compile error for an unknown route, and so screen props get their params typed
 * without each screen re-declaring them.
 *
 * ## One param list, two mutually exclusive groups
 *
 * `Login`/`Register` and the signed-in screens never coexist in the navigator —
 * the root navigator mounts one group or the other based on auth status. They
 * still share one param list, because that is what React Navigation's `navigate`
 * typing binds to; splitting it would mean maintaining a hand-written union for
 * every `useNavigation()` call to typecheck.
 *
 * The safety that appears to give up is not real. Navigating from `Login` to a
 * signed-in screen would not "work but be wrong" — it throws, because the target
 * is not mounted. The mounting rule is the guarantee, not the type.
 *
 * `TaskList` and `TaskComposer` arrive with the screens that implement them.
 * Adding a route here before its screen exists produces a navigator that can be
 * navigated into and renders nothing.
 */
export type RootStackParamList = {
  /** Sign-in. The signed-out entry point. */
  Login: undefined;
  /** Sign-up. Auto-signs-in on success, so it has no success destination. */
  Register: undefined;

  /** The app. Root of the signed-in group. */
  TaskList: undefined;
  /**
   * Create *and* edit, as one screen.
   *
   * `taskId` present means edit, absent means create. One route rather than two
   * because the form is identical — a separate `TaskEdit` route would be the same
   * component with the same fields and a second set of navigation types to keep
   * in step.
   */
  TaskComposer: { taskId?: string };
};

declare global {
  namespace ReactNavigation {
    // React Navigation reads this interface to type the global `useNavigation()`
    // hook, so a screen can call it without importing the param list explicitly.
    interface RootParamList extends RootStackParamList {}
  }
}
