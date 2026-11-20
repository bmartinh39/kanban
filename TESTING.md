# Task-based testing

Run commands from `frontend`. Select checks by the behavior at risk, including shared callers. The goal is fast feedback during edits and broader confidence at integration/release points. Existing tests and coverage thresholds remain intact.

## Choose the checks

| Task | Unit/component/API checks | Browser checks | Build / real persistence |
| --- | --- | --- | --- |
| Documentation only | Review links, commands and diff | None | None |
| CSS, copy, spacing | Existing affected component tests if behavior changes | Focused Chromium; mobile for wrapping, scrolling or docked controls; Firefox for browser-specific CSS | None |
| Forms, assistant composer, confirmation | Affected `board` / `assistant-chat` component tests | Focused Chromium; Firefox for keyboard, focus, native dialogs or animation; mobile for sheet/layout changes | Only if save/commit integration changes |
| Drag/drop, sorting, focus restoration | State, collision, keyboard coordinates and announcement tests as affected | Relevant cases in `board`, `reorder`, `cross-column` or `lists`; Chromium + Firefox, mobile when geometry/scroll/input is affected | Focused persistence if save/revision handling changes |
| Board commands, save/recovery, list operations | `board-state`, `use-board`, `board-api`, `database`; assistant commands if shared | Affected UI integration in Chromium | Build once + affected persistence cases in Chromium |
| Assistant protocol, plan validation, route | `assistant-providers`, `assistant-route`, `assistant-commands` as affected; shared contract for every provider | None for server-only changes; relevant assistant scenarios if the UI contract changes | Persistence when proposal commit behavior changes |
| Database, migrations, startup, deployment | `database`, `database-accessor`, `board-api` as affected | Focused startup/isolation and real API flows | Build once + persistence in Chromium; restart/backup/restore checks for changes to those paths |
| Test scripts/configuration | Exercise changed runner, test discovery and isolation | Small runner smoke; all projects only if project settings change | Production runner smoke only if affected |

Chromium is the default. Mobile Chromium is a viewport/input configuration, not an additional browser engine; it does not verify Safari/iOS. Firefox adds a second engine where browser behavior matters. Do not multiply server/storage assertions across browsers without an interaction reason.

For code completion, also run lint, type checking and `git diff --check` (from the repository root). Documentation-only work needs diff review. Add a regression for a bug or new behavior at the lowest layer that can prove it; do not add tests for simple copy/CSS changes or duplicate every edge case in both components and browsers.

## Focused commands

```powershell
# Select files, then keep them running during edits if useful.
npm test -- tests/assistant-chat.test.tsx
npm run test:watch -- tests/assistant-chat.test.tsx

# Run the shared provider contract for both providers; no live inference.
npm test -- tests/assistant-providers.test.ts tests/assistant-route.test.ts tests/assistant-commands.test.ts

# Select a file and optionally a scenario; inspect the selected names with --list.
npm run test:e2e:chromium -- e2e/assistant.spec.ts --grep "Enter sends once"

# Select all relevant configurations explicitly for sensitive interactions.
npm run test:e2e -- e2e/delete-confirmation.spec.ts --project=chromium --project=firefox --project=mobile

# Only when real save/revision behavior is affected; requires a current build.
npm run build
npm run test:e2e:persistence:chromium -- persistence.spec.ts --grep "two tabs"
```

File/title filters are explicit selection, not dependency analysis. Include consuming components, API boundaries and shared contracts when relevant. Check that a filtered run actually executes the intended scenarios. Avoid automatic Git-based selection as the sole gate: newly added files, shared setup and dynamic imports can make it incomplete.

## Broad regression gate

Before merging a substantive code branch or releasing:

```powershell
npm run lint
npm run typecheck
npm run test:coverage
npm run test:e2e
npm run build
npm run test:e2e:persistence:chromium
```

The full UI command retains Chromium, Firefox and mobile coverage. Use this broad matrix at integration/release points, not for every edit or small isolated fix. Run `npm run test:e2e:persistence` across all configurations when browser-sensitive persistence interactions change. For a small isolated fix, the task's focused completion checks suffice; record scope and omitted broad checks in `PLAN.md`.

Coverage is a broad gate, not the default iteration mode. Keep the existing 90% lines/functions/statements and 85% branches thresholds. Do not lower thresholds, delete regression cases, disable isolation, add retries, or increase worker counts merely to reduce reported runtime. A production build checks bundling and server startup assumptions; it is unnecessary for CSS/text-only fixes.

Rerun passing checks only when subsequent changes can affect them. After a failure, rerun the regression and related cases; do not restart the entire checklist automatically. Never run the UI and persistence suites concurrently in the same checkout: their Next.js outputs are nested/shared. Build only after UI server teardown, then run production persistence.

## Keep meaningful boundaries

- Units prove state transformations, invalid inputs, target validation, atomic batches, stable IDs and revision conflicts. Component tests prove forms, composer states and error feedback. Browser tests prove native focus/dialogs, geometry, drag/drop, animation and representative complete workflows.
- Real SQLite/API tests prove migrations, seed-once/empty-board behavior, transaction rollback, conflicts, reopen persistence and backups. Mocked UI tests cannot replace them. Restart/container/restore validation remains necessary when deployment/storage lifecycle changes; reload alone does not prove restart durability.
- Preserve dedicated ports, temporary databases, server non-reuse and cleared AI keys in ordinary browser runs. Never speed up by testing against the user's saved board or existing app server. Keep current separate artifact directories and database cleanup.
- Automated provider tests use controlled responses. Live checks are separate, synthetic, explicitly selected-model checks when provider/configuration work warrants them; never paid inference on every code edit. Do not infer live connectivity from mocked success.
- Record commands, test counts, failures and limits in `PLAN.md`. No new application server or screenshot review is needed for documentation/test-strategy changes. Use screenshots for actual visual changes, at the affected sizes.

## Review findings and further optimization

The previous checklist required coverage, the complete three-configuration UI suite, a build, and all persistence configurations for routine work. Historical scrollbar work ran 147 UI and 15 persistence cases. Most savings come from selecting affected behavior and avoiding repeated builds/full-suite reruns.

Baseline on 2026-11-20: `npm test` passed 239 tests in 14 files in 40.80 seconds without coverage. Vitest attributed 53% of tracked time to creating 14 jsdom environments (parallel tracked time is not wall time). A possible later optimization is to run pure state/server tests under Node with a separate DOM setup for React tests. That requires separating the current global DOM/board fixtures and validating isolation; do not simply switch environments or share globals to chase speed. No runner-environment changes are included in this strategy revision.
