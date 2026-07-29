/**
 * Native-module smoke checks.
 *
 * ## Why this exists
 *
 * This app depends on nine native modules. Installing them all and then building
 * gives no bisect: when something is wrong the app shows a blank screen or a red
 * box with a stack trace pointing into the bridge, and working out *which* library
 * broke costs more than writing this file did.
 *
 * Each check touches one library in the smallest way that proves its native side
 * actually initialised — a real MMKV write/read round-trip, a real call into
 * Keychain — so a failure names the library instead of describing a symptom.
 *
 * The panel is `__DEV__`-only and never ships in the release UI.
 */

/** Outcome of a single check. */
export interface SmokeResult {
  /** The library under test, as a human would name it. */
  name: string;
  ok: boolean;
  /** Evidence on success, or the error message on failure. */
  detail: string;
}

/** One assertion against one library. */
export interface SmokeCheck {
  name: string;
  /**
   * Exercises the library.
   *
   * @returns A short string of evidence (a returned value, a version) — not just
   *   `true`, because "it did not throw" is weaker than "it gave back the value we
   *   wrote". May be async: several native modules only expose promises.
   * @throws Anything. A throw is the failure signal; the message is reported.
   */
  run: () => string | Promise<string>;
}

/**
 * Runs every check, catching failures so one broken library cannot hide the others.
 *
 * Checks run **sequentially** rather than through `Promise.all`. Several of these
 * touch native initialisers, and running them concurrently on a cold start
 * produced interleaved native logs that were far harder to read than the ~50ms
 * sequential execution costs.
 *
 * @param checks The checks to run.
 * @returns One result per check, in the order given.
 */
export async function runSmokeChecks(
  checks: readonly SmokeCheck[],
): Promise<SmokeResult[]> {
  const results: SmokeResult[] = [];

  for (const check of checks) {
    try {
      const detail = await check.run();
      results.push({ name: check.name, ok: true, detail });
    } catch (error) {
      results.push({
        name: check.name,
        ok: false,
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return results;
}

/**
 * Formats a one-line verdict.
 *
 * Deliberately a single greppable line: the build harness watches logcat for
 * `SMOKE:` between native-module installs, so a regression is caught by the
 * install script rather than by someone noticing a screenshot looks wrong.
 *
 * @param results Results from {@link runSmokeChecks}.
 * @returns A line such as `SMOKE: 8/9 passed — FAILED: react-native-keychain`.
 */
export function formatSmokeSummary(results: readonly SmokeResult[]): string {
  const passed = results.filter((result) => result.ok);
  const failed = results.filter((result) => !result.ok);

  const verdict = `SMOKE: ${passed.length}/${results.length} passed`;
  return failed.length === 0
    ? verdict
    : `${verdict} — FAILED: ${failed.map((result) => result.name).join(', ')}`;
}
