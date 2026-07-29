/**
 * Conventional Commits v1.0.0, enforced as SINGLE-LINE messages.
 *
 * The spec makes the body and footer optional, so a one-line commit is fully
 * compliant — no workaround needed:
 *
 *     <type>(<optional scope>): <lowercase description, no trailing period>
 *
 * Enforced in three places, because each catches what the others miss:
 *   1. the husky `commit-msg` hook  — instant local feedback
 *   2. the `commitlint` CI job      — a local hook is bypassable with `--no-verify`
 *   3. PR titles                    — squash-merge builds the commit on `main` from
 *                                     the PR title, so that is the message a
 *                                     reviewer actually reads in the history
 */
module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    // Allowed types come from config-conventional:
    // build, chore, ci, docs, feat, fix, perf, refactor, revert, style, test
    'header-max-length': [2, 'always', 100],
    'subject-case': [2, 'never', ['sentence-case', 'start-case', 'pascal-case', 'upper-case']],
    'subject-full-stop': [2, 'never', '.'],
    'subject-empty': [2, 'never'],
    'type-empty': [2, 'never'],
    'type-case': [2, 'always', 'lower-case'],

    // Keep commits to a single line. A body is almost always a sign the commit
    // should have been split; rationale belongs in the PR description or an ADR.
    // (`body-empty: always` is the rule that actually does this — commitlint has
    // no `body-max-lines`, which fails loudly at startup rather than silently.)
    'body-empty': [2, 'always'],
  },
};
