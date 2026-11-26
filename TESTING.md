# Testing

Run commands from `frontend`. There are two levels: a fast task loop run by the agent, and the full gate run by CI on every pull request (`.github/workflows/ci.yml`). Do not run the full gate locally unless CI is unavailable or a CI failure needs reproducing.

## Task loop

1. Run only the Vitest files for the code you changed and its direct callers, without coverage: `npm test -- tests/board-state.test.ts`. Use `npm run test:watch -- <file>` while iterating.
2. If user-visible behavior changed, run only the matching Chromium scenarios: `npm run test:e2e:chromium -- e2e/board.spec.ts --grep "creates cards"`. Add `--project=mobile` for responsive layout/touch changes and `--project=firefox` for drag/drop, focus or dialog changes. CSS/copy-only changes need no browser run unless layout is at risk.
3. If save/revision/database/startup behavior changed, build once, then run the affected persistence case: `npm run build` then `npm run test:e2e:persistence:chromium -- --grep "<name>"`.
4. Before finishing: `npm run lint`, `npm run typecheck`, and `git diff --check` from the repository root.

Documentation-only changes need only a diff review. Add a regression test at the lowest layer that proves a bug fix or new behavior; do not duplicate the same assertion in unit and browser tests. After a failure, rerun the failing test and related cases, not the whole checklist.

What a change implements decides which tests it needs, not a coverage number. Test contracts and invariants thoroughly: revision checks, transactional batches, migrations, validation of untrusted model output, and provider errors. For presentational UI and glue code, test only the user-visible behavior. Do not add tests whose only purpose is raising coverage.

## Full gate (CI)

Pull requests that only change Markdown files or `.claude/` skip the test jobs. Otherwise CI runs lint, typecheck, `npm run test:coverage` (a report only; no thresholds), the full UI suite in Chromium, Firefox and mobile Chromium, a production build, and the Chromium persistence suite. Do not delete regression cases or add retries to make it pass.

## Isolation rules

- UI tests start their own dev server on port 3210 (`PLAYWRIGHT_PORT` overrides), never reuse an existing server, use a temporary database, and clear live AI keys. Persistence tests use a production server on port 3220 with a temporary database.
- Firefox cannot launch inside a restricted filesystem sandbox; run Firefox checks with sandbox access instead of debugging the crash.
- Never run the UI and persistence suites at the same time in one checkout; they share Next.js output.
- Automated tests use controlled AI responses only. Live provider checks are separate, use synthetic boards and the selected model, and are reported separately.
