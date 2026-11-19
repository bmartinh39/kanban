# Kanban MVP implementation plan

Original MVP scope: one client-rendered board, exactly five renameable columns, and cards containing only a title and details. Users can add cards, delete cards, and drag cards between columns. State lives in memory and resets to dummy data on reload. No accounts, backend, persistence, search, filters, or archive. Follow-up requirements are tracked below and do not change the completed MVP checklist.

## MVP baseline (2026-11-18)

- MVP complete; all five phases are checked off. No outstanding implementation or test blockers.
- Application committed as `e76d907` (`Build polished single-board Kanban MVP with automated tests`) and pushed to `main` at https://github.com/bmartinh39/kanban. Local `main` tracks `origin/main`.
- Latest checks: lint, TypeScript, 26 unit/component tests, production build, and all 30 Playwright scenarios pass. The latest browser run used the development server; Firefox passes when browser processes run outside the restricted sandbox.
- Development server at http://localhost:3000 returned HTTP 200 during this status update. Restart with `cd frontend` then `npm run dev` if needed.
- Known maintenance item: the earlier dependency audit reported seven moderate advisories in transitive development lint dependencies; the production dependency audit was clean. The audit was not rerun for this documentation update.
- Requirements remain in `AGENTS.md`; setup and test commands are in `README.md`.

## Follow-up backlog

GitHub Issues tracks outstanding follow-up work.

- [x] [#5: Add database support](https://github.com/bmartinh39/kanban/issues/5). Implemented and verified; decisions, acceptance criteria, and results are recorded below.

- [x] [#1: Reorder cards within the same column](https://github.com/bmartinh39/kanban/issues/1). Completed pointer and keyboard sorting with accessible feedback in [PR #4](https://github.com/bmartinh39/kanban/pull/4). The issue is closed as completed.
- [x] [#2: AI assistant to create, edit, and move cards](https://github.com/bmartinh39/kanban/issues/2). Implemented as an always-visible in-app chat with provider-independent OpenAI/OpenRouter support. Unit, contract, browser, and live OpenRouter checks are complete. The example configuration pins a specific free model.
- [ ] [#3: Create new lists](https://github.com/bmartinh39/kanban/issues/3). Replace the fixed-five-column constraint with dynamic lists; keep the existing five lists as initial dummy data.

Success criteria: each issue's acceptance criteria and relevant unit/browser tests pass before it is closed. Issue #5 adds board persistence; list deletion and additional boards remain outside these requests. The original requirements in `AGENTS.md` describe the MVP baseline; the new-lists issue explicitly supersedes its fixed-column restriction for follow-up implementation.

### Issue #5: Database implementation decision (2026-11-19)

Decision: use SQLite through `better-sqlite3` in the existing Next.js Node.js server. Use parameterized SQL and small numbered SQL migrations, without an ORM, a separate backend, or a database service. Add `@types/better-sqlite3` for development; resolve and lock current compatible releases during implementation. The native driver must be installed/built for the Linux container target rather than copied from Windows.

SQLite fits one shared board and short, infrequent write transactions on one VPS. Start with one application instance and a database on local persistent storage. Reconsider PostgreSQL when deployment needs independent application replicas/hosts or sustained concurrent writes; increasing card count alone is not the migration trigger. `node:sqlite` is an alternative but remains experimental in the installed Node.js 24.11.1 runtime; prefer the established driver for this change.

Scope: persist column names, cards, column order, and card order. Keep five initial columns, the existing UI and AI provider interface, and session-only chat. Issue #3 still owns creating lists. There is one shared saved board across browsers, without accounts or live collaboration. This follow-up supersedes the MVP's reset-on-reload behavior and browser-owned authoritative board state. AGENTS.md and README.md now document this follow-up; retain the original MVP history above.

Minimal relational schema:

| Table | Fields and constraints | Purpose |
| --- | --- | --- |
| `board_state` | `id INTEGER PRIMARY KEY CHECK (id = 1)`, `revision INTEGER NOT NULL CHECK (revision >= 0)` | One metadata row for atomic optimistic concurrency and first-run initialization. |
| `columns` | `id TEXT PRIMARY KEY`, `name TEXT NOT NULL CHECK (length(trim(name)) > 0)`, `position INTEGER NOT NULL CHECK (position >= 0)` | Existing stable column IDs, names, and display order. |
| `cards` | `id TEXT PRIMARY KEY`, `column_id TEXT NOT NULL REFERENCES columns(id)`, `title TEXT NOT NULL CHECK (length(trim(title)) > 0)`, `details TEXT NOT NULL DEFAULT ''`, `position INTEGER NOT NULL CHECK (position >= 0)` | One row per card; no duplicated column name or nested JSON. |

Add indexes on `columns(position)` and `cards(column_id, position)`. Maintain contiguous integer positions transactionally when adding/deleting/moving cards; update only affected rows. Avoid unique position constraints that complicate intermediate reorder updates. Do not add users, board ownership, timestamps, counts, chat tables, or soft deletes. Use SQLite `PRAGMA user_version` to track the schema migration version. The singleton metadata row is initialization evidence: a deliberately emptied board must never be reseeded.

- [x] Phase 1: Add server-only database access under `frontend/app/server/db/`, SQL migrations, and a configurable `DATABASE_PATH` (container: `/data/kanban.sqlite`). Enable foreign keys, WAL, a bounded busy timeout, and `synchronous=FULL`. Run migrations as a deployment/startup step before serving traffic; initialize dummy data once in a transaction. Keep build steps independent of a production database. Ignore local databases and their journal/WAL/SHM files.

  Success criteria: a fresh temporary database initializes once; reopening it preserves edits and deletions; migration failures stop startup; lint/types/build pass with the native driver.

- [x] Phase 2: Add uncached `GET /api/board` and `POST /api/board/actions` using the Node.js runtime. Reads return `{ columns, revision }`. Writes accept an expected revision and a bounded, validated batch of supported domain commands. In one short transaction, check the revision, resolve/validate every target, apply the whole batch, increment the revision, and return canonical board state. A mismatch returns HTTP 409 with no writes; invalid commands also leave state unchanged. Never accept arbitrary SQL or silently overwrite the full board. Preserve IDs and content through moves and edits, and check same-origin mutations.

  Success criteria: all existing operations persist with correct ordering; invalid batches roll back; two clients writing the same revision cannot silently overwrite each other. Validation covers stale/missing IDs, duplicate IDs, blank names/titles, and invalid positions.

- [x] Phase 3: Introduce a small client board-state hook using React state and fetch, reusing the existing reducer for local projections. Load the saved board with clear loading/error/retry states. Keep drag overlays and sorting previews local; save once on a completed drop. Allow one pending mutation per browser, show saving/error feedback, and adopt the canonical response after success. On failure reload authoritative state; on 409 explain that the board changed and let the user retry. Do not silently replay failed commands or restore dummy data on load errors. No React Query or other client state dependency is needed for this single resource.

  Success criteria: add/delete/rename/move/reorder survive reload; controls and focus remain usable; failed saves cannot appear as confirmed changes; drag cancellation writes nothing.

- [x] Phase 4: Adapt the assistant route to read the authoritative database snapshot and revision rather than trusting a browser-supplied board. Keep `AssistantProvider.generatePlan` and the current provider adapters unchanged. Generate and validate proposals outside database transactions. Return the snapshot revision with each plan; apply validated actions through the same atomic mutation path only if both the local snapshot and database revision still match. Revalidate all submitted commands on the server. Report assistant success only after the save commits; retain clarification/refusal/no-op behavior without revision changes.

  Success criteria: manual and assistant edits use the same persistence rules; intervening changes from either tab reject stale plans; provider errors and invalid batches write nothing; no database lock is held during inference; existing provider contract tests remain controlled and pass.

- [x] Phase 5: Add a production Dockerfile and Compose service with a named volume mounted at `/data`; run migrations before starting Next.js and ensure the non-root app user can write the directory, including WAL/SHM files. Keep secrets in runtime configuration. Provide a small backup command using the driver's SQLite backup API, plus concise restore instructions while the application is stopped. Do not copy a live `.sqlite` file alone or place the active database on a network filesystem. Verify the Linux image includes the native driver.

  Success criteria: saved data survives process restart and container recreation; a backup restores into a fresh volume with matching content/order; failed migration does not start the server; document that deleting the volume deletes the data.

- [x] Phase 6: Add real SQLite tests against isolated temporary files for constraints, migrations, first-run seeding, reopen persistence, order, rollback, and competing revisions. Retain isolated UI tests with a per-test controlled persistence API; do not share production storage or a reset endpoint. Add a separate serial browser integration suite with an isolated database/server covering reload persistence, two-tab conflict, saved assistant batches, and failed saves. Update existing reset-on-reload expectations. Run affected flows in Chromium, Firefox, and mobile Chromium, plus the full verification commands and `git diff --check`.

  Success criteria: lint, typecheck, coverage, browser suites, and build pass; container restart and backup/restore checks pass; record actual verification and remaining limits here. Leave the application running for review after implementation.

Known limits: no automatic cross-tab push updates, offline queue, chat persistence, authentication, or new-list functionality. Other browsers see saved changes on reload; stale writes are detected. Existing browser-only session state cannot be recovered after reload, so there is no historical data migration. Database and container verification is complete as recorded below.

Decision references: [SQLite deployment guidance](https://www.sqlite.org/whentouse.html), [better-sqlite3](https://github.com/WiseLibs/better-sqlite3), [SQLite WAL](https://www.sqlite.org/wal.html), [online backups](https://www.sqlite.org/backup.html), and [Node.js 24 SQLite stability](https://nodejs.org/download/release/v24.9.0/docs/api/sqlite.html).

Verification (2026-11-19):

- Lint, typecheck, production build, and all 172 unit/component/API/provider/database tests pass. Configured coverage: 98.62% lines, 97.31% statements, 96.12% functions, and 92.18% branches; the database, board API, validation, HTTP boundary, and persistence hook are included.
- All 57 controlled UI browser scenarios pass across Chromium, Firefox, and mobile Chromium. All 12 additional production-server scenarios with a real isolated SQLite database pass across those same projects. Firefox requires execution outside the sandbox. Browser plugin not available; used the existing Playwright workflow.
- The persistence suite verifies reloads, column names, card details/IDs/order, keyboard moves, two-tab conflicts, assistant saves and stale proposals, and failed saves. A mobile test was corrected to wait for the actual sorting announcement before dropping. UI regressions found during implementation were fixed: keyboard focus restores after the saved card remounts; temporary save gating preserves focus on add/rename triggers.
- Production review at http://localhost:3001 (also verified through 127.0.0.1) passed page identity, nonblank content, no framework overlay, no application console errors, and desktop/mobile visual review at 1440x1000 and 390x844. Screenshots are in the OS temporary directory as `kanban-issue5-desktop.png` and `kanban-issue5-mobile.png`. A native production rename survived reload and was restored afterward; the saved board retains its 12 initial cards.
- Clean Linux Docker build passes with the native driver compiled in the build stage, without build tools in the runtime image. Repaired missing cross-platform optional lockfile entries exposed by Linux `npm ci`. The final pruned production dependency audit reports zero vulnerabilities; seven existing moderate development dependency advisories remain.
- Compose configuration validates. An isolated non-root container (UID 1000) accepted real HTTP mutations through a published host port. Its saved board matched exactly after container recreation on the same volume. The live backup command restored into a fresh volume with identical IDs, names, details, ordering, and revision; SQLite `integrity_check` returned `ok`. Deliberately setting an unsupported schema version caused startup to exit before serving traffic. Disposable containers and their synthetic volumes were removed afterward.
- Fixed origin checks to use the browser-facing Host address when Next.js normalizes its internal URL, including published Docker ports. Cross-origin rejection is retained and regression-tested.
- Board data stays in the ignored local `frontend/data` directory. The final native production server is running at http://localhost:3001, leaving the pre-existing port 3000 process untouched. Secret values and local databases are excluded from version control. GitHub issue changes were not part of implementation.
- Live inference was not rerun for this change. Provider contract tests and browser assistant responses are controlled; the previously verified OpenRouter adapter is unchanged. Chat remains session-only, other browsers refresh on reload, and deployment uses one app instance with a local persistent volume.

### Issue #2 implementation plan

Final delivery: `AGENTS.md` now records approved follow-up scope, provider boundaries, environment/secret handling, model pinning, action validation, and verification expectations. `README.md` covers setup and deployment. No outstanding implementation blockers remain; historical verification notes below distinguish earlier configuration gaps from the subsequent successful live OpenRouter smoke tests. OpenAI's adapter is covered by contract tests, with no paid live calls made.

Provider portability follow-up:

- [x] Add a provider interface and environment-selected OpenAI/OpenRouter adapters, keeping API protocols outside board and route logic.
- [x] Configure `AI_PROVIDER` and `AI_MODEL`, use only the selected provider's secret, preserve legacy `OPENAI_MODEL`, and document deployment.
- [x] Verify both adapters against the same contract, configuration errors and route behavior; run coverage, lint, production build, and affected chat browser checks.

Success criteria: changing between supported providers/models requires only environment settings and a restart/redeploy. An unsupported provider or missing key produces a clear error without calling another provider. Neither the chat UI nor board operations depend on a specific upstream API.

Provider follow-up verification: 127 unit/component/API/contract tests passed (98.63% configured line coverage), along with lint and the production build including TypeScript. All 12 affected chat browser cases passed across Chromium, Firefox, and mobile Chromium. The server is running at http://localhost:3000 and returns HTTP 200. Both configured secrets are in the ignored `.env.local`, with empty placeholders in `.env.example`; no live inference calls were made. OpenAI defaults to `gpt-6-luna`, OpenRouter to `openrouter/free`, and `AI_MODEL` overrides either. Existing `OPENAI_MODEL` remains a fallback only for OpenAI. Live provider verification is still pending.

Subsequent pinned-model verification: `.env.local` and `.env.example` now explicitly select `AI_PROVIDER=openrouter` and `AI_MODEL=nvidia/nemotron-3.5-super-vl:free`. No provider implementation changed to select this model. The live OpenRouter endpoint passed three synthetic requests: create a card; edit and move an existing card in one batch; and clarify duplicate card titles without returning operations. The key is validated and the restarted server is running at http://localhost:3000. The original sandboxed server could not complete an external request; running the server with approved network access resolved it. GPT-OSS-120B's free model page exists, but its endpoint listing returned no active endpoints when checked, so it was not selected. OpenAI's paid adapter has contract-test coverage but has not been live-tested.

Agreed workflow: an always-visible in-app chat operates on the currently open, in-memory board. Its window stays on the right on desktop, with robot/sparkle icons and an AI label; on mobile it remains docked below a separately scrolling board. Use TypeScript and a Next.js server route with OpenAI Responses structured output. `OPENAI_API_KEY` stays server-side; `OPENAI_MODEL` selects the model. No persistence or accounts are added. Each request includes current board state and recent chat messages; validated actions are applied atomically only if that board snapshot is still current.

- [x] Add validated create/edit/move commands, preserving IDs and rejecting invalid or ambiguous targets without partial changes.
- [x] Add the server route, bounded input, provider error handling, server-only configuration, and setup documentation.
- [x] Add accessible chat controls, conversation feedback, loading/error states, and stale-board protection.
- [x] Test state commands, API boundaries and provider responses, and desktop/mobile browser flows; rerun lint, types, coverage, and production build.
- [x] Leave the server running and record verification and any missing live-provider configuration.

Success criteria: all issue #2 operations and clarification/error flows work without losing existing board behavior. Automated provider tests use controlled responses; a live-provider smoke test requires a configured API key. Browser plugin not available; use the project's Playwright workflow.

Verification (2026-11-19):

- Lint, production build (including TypeScript), and 97 unit/component/API tests passed. Configured line coverage is 98.56%.
- All 57 browser scenarios are verified across desktop Chromium, Firefox, and mobile Chromium. The final full run passed 56/57; after correcting the remaining mobile test to aim at the card's layout position rather than its animated preview, all three affected browser cases passed. No application code changed after the full run.
- Tests cover create/edit/move, preserving IDs and content, ambiguous references, invalid input, provider failures/refusals, missing configuration, clarification, stale replies, keyboard controls, and panel visibility after scrolling.
- Desktop (1440x1000) and mobile (390x844) screenshots were visually reviewed. Title/content render correctly, no framework overlay or runtime errors were observed, and the panel does not obscure board controls. Drag collision also excludes portions clipped by the mobile board frame.
- Production server is running at http://localhost:3000. The real route returns the expected configuration response without a key. No `OPENAI_API_KEY` is configured; real-provider behavior remains unverified. The GitHub issue remains open pending live-provider verification and integration.

### Issue #1 verification

- Independent task reviews, whole-branch review, and scoped re-review are complete. All findings were addressed, including readable screen-reader feedback and keyboard test readiness. The branch awaits the user's integration decision.

- Lint, TypeScript, the production build, and all 56 unit and component tests passed. Configured line coverage reached 97.45%.
- All 45 Playwright cases passed with zero skips across desktop Chromium, Firefox, and mobile Chromium. Same-column pointer sorting ran at each browser project's default viewport, including 390px mobile width.
- Drag announcements give the card title, current column name, and one-based position and count. A browser regression uses a newly created card in a renamed column.
- The browser suite verifies keyboard boundaries, focus after drop and cancellation, cancellation and outside release after a preview, transfers to populated and empty columns, reordering on a scrolled board, and the reload reset. Desktop and mobile screenshots show the moving overlay, destination highlight, and shifted cards.
- The feature's production server returned HTTP 200 at http://127.0.0.1:3100.

## Phase 1: Scaffold and tooling

- [x] Check the available Node.js environment and verify current stable library releases against official sources before installing.
- [x] Create a modern Next.js App Router application in `frontend`, using TypeScript, ESLint, and a committed package lockfile.
- [x] Add `.gitignore` rules for dependencies, build output, coverage, Playwright reports, local environment files, and editor/OS artifacts.
- [x] Configure Vitest with React Testing Library for unit/component tests and Playwright for browser tests.
- [x] Provide scripts for development, linting, type checking, unit tests, browser tests, and production builds.

Success criteria: the initial app starts locally; lint, type checking, a test-runner smoke check, and the production build succeed. Generated files and secrets are excluded from Git.

## Phase 2: Board state and behavior

- [x] Define simple typed column/card models with stable IDs and representative dummy data across all five columns.
- [x] Keep board state in a client component with small, testable state operations; avoid an unnecessary state-management library.
- [x] Implement column renaming, adding a card to a selected column, deleting a card, and moving a card between columns using a maintained drag-and-drop library.
- [x] Require nonblank card titles and column names; trim submitted values. Details may be empty.
- [x] Support cancelling forms without changing state. Keep the column count fixed at five.

Success criteria: each action updates only its intended state; moving a card preserves its ID, title, and details without duplication; reloading restores the initial data. Unit tests cover every state operation, invalid submissions, cancelled edits, empty columns, and repeated moves.

## Phase 3: Polished, accessible interface

- [x] Build a restrained board layout with clear typography, generous spacing, subtle card shadows, and consistent controls.
- [x] Apply navy `#032147` headings, blue `#209dd7` highlights, purple `#753991` primary actions, yellow `#ecad0a` accents, and gray `#888888` supporting text where contrast permits.
- [x] Make all five columns reachable on small screens through horizontal scrolling, with usable card widths and touch targets.
- [x] Add clear drop targets, drag feedback, empty-column states, and visible keyboard focus.
- [x] Provide accessible names and labels, keyboard drag-and-drop support, and correct focus handling for any dialogs.
- [x] Keep cards limited to title and details; omit unrelated navigation, metadata, and additional product features.

Success criteria: the board looks complete on desktop and mobile; controls work with keyboard and pointer; forms expose understandable validation; dialogs, if used, support Escape and return focus to their trigger. Component tests verify forms, rename controls, deletion, and cancellation through user-visible behavior.

## Phase 4: Browser integration and visual review

- [x] Exercise the populated initial board and verify exactly five columns.
- [x] Test adding cards with and without details, rejecting blank titles, cancelling creation, and deleting the intended card.
- [x] Test renaming columns, rejecting blank names, and cancelling renames.
- [x] Test pointer and keyboard moves into populated and empty columns; verify that card content and total card count are preserved.
- [x] Test a sequence of add, move, rename, and delete actions, then reload to verify the deliberate state reset.
- [x] Review desktop and mobile screenshots; check column scrolling, long text wrapping, focus behavior, and browser console errors.
- [x] Run browser coverage in Chromium and at least one additional engine, fixing defects and rerunning affected checks.

Success criteria: all Playwright scenarios pass; desktop and mobile layouts have no clipped controls or overlapping content; no application console errors remain. Any unavailable browser tooling is documented as an unresolved verification gap.

## Phase 5: Final verification and handoff

- [x] Run lint, type checking, the full unit/component suite, browser tests, and a production build against the final code.
- [x] Keep the README concise: prerequisites, installation, startup, test commands, and the in-memory reset behavior.
- [x] Review the final diff for accidental files, scope creep, and unnecessary complexity.
- [x] Leave the application server running, verify its URL responds, and provide the URL along with a concise verification report.

Success criteria: the complete MVP meets the stated scope, all required checks pass, and the user can open the running application. Implementation is complete only after these conditions are verified.


## Initial verification results

- Implemented in `frontend` with Next.js 16.4.6 and React 19.3.0; dependencies are locked. ESLint 9 and jsdom 29 are the compatible releases for the installed Next.js plugins and Node.js 24.11 environment.
- Lint, TypeScript checks, and production build pass.
- 26 unit/component tests pass: 98.7% line, 95.12% statement, 91.83% function, and 88.23% branch coverage. State operations and keyboard coordinate logic have full coverage.
- All 30 Playwright scenarios pass against the production build across desktop Chromium, Firefox, and mobile Chromium. Desktop/mobile screenshots were visually reviewed.
- Fixed dialog autofocus, focus return, keyboard focus cycling, and keyboard dragging across a horizontally scrolling board. Browser tests verify those behaviors.
- Production dependency audit is clean. npm reports seven moderate advisories in transitive development lint dependencies; available automatic fixes did not resolve them.
- At the initial handoff, the production server was left running at http://127.0.0.1:3000; HTTP readiness was verified. The separate in-app preview browser could not open because its access host was unavailable; Playwright browser verification completed successfully. See the MVP baseline for the later development-server check.

### Review follow-up

- Confirmed the `Card` export syntax fix; type checking, all 26 unit/component tests, lint, and the production build pass.
- Keyboard browser tests now wait for the destination highlight after horizontal scrolling before dropping, rather than racing the asynchronous drop-target update.
- All 30 browser tests pass against the development server across desktop Chromium, Firefox, and mobile Chromium. Firefox requires running the browser suite outside the restricted sandbox; its page-launch crashes do not reproduce there.
- The local development server responds with HTTP 200 at http://localhost:3000.

## Issue #6: Seamless card drops (2026-11-19)

- [x] Reproduce and fix the return-to-origin animation for sorting and moves between columns.
- [x] Show the dropped position while saving, keeping SQLite authoritative and existing conflict/error recovery intact.
- [x] Add delayed-save browser regressions for pointer and keyboard drops; verify cancellation still works.
- [x] Run lint, type checking, coverage, browser suites, production build, persistence checks, and diff review. Leave the local server available.

Success criteria: a successful drop animates directly to its destination, never flashes at its source while saving, and sends only one revision-checked write. Failed saves recover from the server without replaying the move.

Verification:

- The overlay previously measured the card at its original saved position because the drop handler awaited the server. A local drop preview now updates the layout before landing measurement and remains visible while saving. The saved snapshot/revision and recovery path are unchanged; server confirmation or readback replaces the preview.
- Lint, type checking, production build, and all 172 unit/component tests pass (98.63% line coverage).
- All 72 controlled Playwright UI scenarios pass across Chromium, Firefox, and mobile Chromium. Added delayed-save tests verify actual animation landing coordinates, immediate destination order, unchanged saved revision while pending, one write, keyboard focus, and conflict recovery. Existing cancellation and outside-board tests pass.
- All 12 production-server persistence browser scenarios pass against isolated temporary SQLite databases, including stale revisions and failed-save recovery. No live AI calls were made.
- Browser plugin not available; used the existing Playwright workflow. Firefox required execution outside the restricted sandbox because its pages crash on launch inside it. Initial regression assertions were corrected to account for mobile scrolling and Next.js's separate alert element. Final UI and persistence runs completed separately to avoid sharing Playwright's artifact directory.
- Desktop (1440 x 1000) and mobile (390 x 844) screenshots after a keyboard move were visually reviewed; the expected page title/content rendered, no framework overlay appeared, and console/runtime errors were absent. Screenshots are in the OS temporary directory, outside the repository.
- `git diff --check` passes. Only the page, browser regressions, and this plan changed; no files or secrets are staged. Local server returned HTTP 200 at http://localhost:3000 and remains running.
