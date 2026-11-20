# Repository review

Reviewed on 2026-11-20 at commit `0b0b6ca`, including the current project reviewer configuration. Scope: application code, tests, dependency manifests/lockfile, Docker configuration, and repository documentation. This is a review report; no application fixes or dependency changes were made.

## Assessment

The architecture is appropriate for a small, single-board application. The most useful improvements are to make validation limits consistent, preserve rejected input, isolate browser-test startup from local data, and make the existing UI and validation code easier to read. A larger architectural rewrite is unwarranted.

No high-priority finding was confirmed. The full dependency audit reports seven moderate package findings arising from one development-tool dependency advisory; the production-only audit reports zero known vulnerabilities. These are audit results at review time, not a guarantee of security.

## Architecture overview

- `app/page.tsx` renders the board and coordinates drag previews, dialogs, focus restoration, and assistant application. `use-board.ts` owns loading, saving, and recovery.
- `board-state.ts` contains domain types, seed data, and immutable state transitions. `board-commands.ts` validates commands and targets; both the client preview and database path use those transitions.
- API routes obtain the authoritative saved snapshot. Assistant inference is behind `AssistantProvider.generatePlan`; OpenAI and OpenRouter share a Responses protocol adapter.
- `assistant-commands.ts` parses plans and resolves human-readable targets to concrete board commands. Client confirmation precedes list-deleting batches; the persistence layer checks revisions again.
- SQLite access uses prepared statements, immediate transactions, foreign keys, and a singleton revision. Startup migrations seed once. Docker mounts the whole database directory and runs as the Node user.

These boundaries are worth preserving. In particular, inference does not hold a database transaction open, invalid command batches are rejected before writes, and failed saves are read back rather than automatically replayed. Separate provider-contract tests and real SQLite tests cover meaningful failure modes.

## Actionable findings

### R1 — Medium: assistant output can make subsequent chat requests invalid

**Evidence:** `frontend/app/api/assistant/route.ts:29` validates every conversation message, including assistant messages, at a maximum of 4,000 characters. In contrast, `frontend/app/assistant-commands.ts:38` accepts any nonblank plan message without a length limit. `prepareActions` builds outcome messages from board/card titles at `frontend/app/assistant-commands.ts:75`, `:94`, `:107`, and `:112`; command text may be up to 20,000 characters (`frontend/app/board-commands.ts:9`). The UI stores the returned message at `frontend/app/assistant-chat.tsx:55` and resends recent messages at `:38`.

**Impact:** a valid response with no operations and a 4,001-character explanation, or a valid operation involving a sufficiently long title, can succeed and then cause the next request to fail HTTP 400 before inference. Restoring and resubmitting the draft retains the offending conversation message. Reloading clears chat; enough subsequent failed submissions can eventually push it out of the history window, but neither is a good recovery flow.

**Recommendation:** define a consistent conversation budget and explicitly construct bounded outbound history. Bound or summarize generated outcome messages and handle overlong upstream explanations. Keep any full display message separate from the compact context sent back to the provider if necessary. Test a long clarification and a long-title operation followed by another request.

**Tradeoff:** truncation can lose context, so prefer a concise deterministic outcome and preserve relevant card/list identity. Raising the request limit alone increases inference payload size and does not resolve the inconsistent contract.

**Confidence:** confirmed by tracing validators and state flow; the long-message scenario was not executed in a browser.

### R2 — Medium: forms discard text when an API limit rejects it

**Evidence:** the rename input at `frontend/app/page.tsx:66` has no length limit. The card-details textarea at `:110` also has no limit, while API command text is capped at 20,000 characters in `frontend/app/board-commands.ts:9`. `finishRename` closes the editor immediately at `frontend/app/page.tsx:58`. Creation callbacks dispatch and close immediately at `:221` and `:222`; `dispatch` at `:121` returns no save result to the form.

**Impact:** paste more than 20,000 characters into details or a list rename and submit. The API rejects the save; the editor has already closed and lost the local input. The board displays a storage error for a validation problem. The same immediate closure also loses drafts on an ordinary rejected or failed save.

**Recommendation:** share field-limit constants between inputs and command validation. Return the save promise to the form, display validation errors near the input, and retain the draft until the outcome is known. Preserve the existing recovery/read-back behavior for uncertain network outcomes; do not automatically replay a possibly committed create.

**Tradeoff:** forms need a small saving/error state and a deliberate uncertain-save recovery path. This is preferable to adding a form library for these few fields.

**Confidence:** confirmed in code; no browser reproduction performed.

### R3 — Medium: ordinary browser-test startup uses the local database configuration

**Evidence:** `frontend/playwright.config.ts:17` launches `npm run dev` without supplying an isolated `DATABASE_PATH`, and permits reuse of an existing server. `frontend/package.json:16` defines `predev` as `npm run db:migrate`. The default database path and initialization behavior are in `frontend/app/server/db/connection.ts:15` and `:23`. The separate persistence configuration correctly supplies a temporary database at `frontend/playwright.persistence.config.ts:22`.

**Impact:** on a machine without an already-running server, the ordinary UI suite can initialize, seed, or migrate the developer's configured database before any test runs. The UI fixtures intercept board reads and writes (`frontend/e2e/fixtures.ts:9`), so this is a startup database side effect, not evidence that the mocked test cards are saved to the real board. Reusing a server also makes the tested process configuration depend on what happened to be running.

**Recommendation:** give the ordinary browser-test server a temporary database path too, and use a dedicated test port/process when repeatable isolation matters. Keep the controlled API fixtures.

**Tradeoff:** a dedicated process adds startup time. Any optional reuse mode should be explicit and limited to a known test server.

### R4 — Low: development lint tooling includes a verified vulnerable transitive dependency

**Evidence:** `frontend/package-lock.json:2394` locks the nested `@typescript-eslint/typescript-estree/node_modules/minimatch` to `10.2.6` and marks it development-only. A read-only `npm audit --json --ignore-scripts` reports seven moderate package entries propagated through the TypeScript ESLint dependency chain, with one underlying advisory: [GHSA-g3hv-75wg-m249 / CVE-2026-118764](https://github.com/advisories/GHSA-g3hv-75wg-m249).

The advisory describes excessive CPU/memory consumption for attacker-controlled glob patterns when the affected optimization mode is enabled. It lists affected versions `>=7.0.0 <11.0.1` and a patch in `11.0.1`. Audit metadata flags a fix as available.

**Impact:** dependency hygiene and potential tooling denial of service if an affected call path processes adversarial glob patterns. This review did not demonstrate an exploitable repository lint path. This is not seven independent vulnerabilities and is not evidence of a browser/API runtime exploit. `npm audit --omit=dev --json --ignore-scripts` reports zero vulnerabilities; the Docker build prunes development packages at `frontend/Dockerfile:10`.

**Recommendation:** update the compatible lint dependency chain and lockfile in a separate change, inspect the resulting tree, and rerun lint/type checking/tests. Confirm resolution with a fresh audit. Prefer the upstream dependency update over forcing an unverified major-version override of minimatch.

**Tradeoff:** upstream lint updates can change diagnostics and supported Node versions. The audit's fix flag alone does not establish that every proposed change is compatible.

### R5 — Low: request-size checking happens after buffering the entire body

**Evidence:** `frontend/app/server/board-http.ts:16` awaits `request.text()` and only then checks `raw.length > 200_000` at `:17`. The check counts JavaScript string length rather than incoming bytes. Both mutation and assistant routes share this helper.

**Impact:** the 413 check limits parsed application input but does not bound memory used to receive/decode an oversized request. Actual exposure depends on hosting/proxy request limits; those limits are not configured in this repository. No resource-exhaustion experiment was performed.

**Recommendation:** establish a byte limit at the reverse proxy and/or consume the request stream with a running byte limit before decoding and parsing. A `Content-Length` precheck is useful but should not be the only check because it can be absent. Keep the helper shared between routes.

**Tradeoff:** a bounded reader adds code; for a private deployment, a documented and enforced proxy limit may be enough. Preserve useful input errors and test multibyte and streamed oversized bodies if changing the helper.

## Readability and optional refactors

### O1 — Medium: separate board orchestration from compressed presentation code

**Evidence:** `frontend/app/page.tsx:43` places a long inline prop type, drag insertion geometry, rename editing, and card rendering in `BoardColumn`. `Home` at `:116` combines persistence, three dialog states, drag/drop, DOM queries, focus restoration, and the page shell. The main board render at `:215` puts all list callbacks on one line; `AssistantChat` has a similar inline prop contract at `frontend/app/assistant-chat.tsx:10`.

**Why it matters:** the file is only 225 lines, but physical line count hides its responsibilities. Reviewing the ordering of focus effects, storage updates, and drag previews requires jumping through tightly packed expressions. This increases the effort needed to safely change already delicate interactions.

**Suggested change:** first expand JSX and prop types into readable blocks. Move `BoardColumn`/`TaskCard` and `AddItemDialog` into a small number of named modules; retain state near the component that owns it. Extract drag coordination only if it becomes simpler to explain and test. Remove the unnecessary `actions as BoardCommand[]` at `frontend/app/page.tsx:127` because `prepareActions` already returns that type.

**Tradeoff:** extra files add navigation. Avoid a generic controller framework, a new state library, or one file per tiny visual fragment. Existing pointer/keyboard and confirmation tests should guard a behavior-preserving refactor.

### O2 — Low: make command validation explicit and reduce contract drift

**Evidence:** `frontend/app/board-commands.ts:17` uses a nested ternary across every command type. Assistant operation names and fields appear independently in the TypeScript type (`frontend/app/assistant-commands.ts:5`), JSON schema (`:16`), parser (`:38`), and preparation logic (`:67`). The size mismatches in R1/R2 illustrate the cost of contracts spread across modules.

**Suggested change:** replace the nested ternary with a readable discriminant `switch`; share text/conversation limits and operation-name constants. Keep wire-shape validation distinct from target resolution and revision checking. Retain explicit handling of invalid model output even when requesting a strict schema from the provider.

**Tradeoff:** generating all types and validators from a schema adds machinery. The current dependency set does not require another schema library; a small set of shared constants and clearer branches is sufficient unless the protocol grows.

### O3 — Low: remove the obsolete assistant reducer action

**Evidence:** `frontend/app/board-state.ts:9` defines a recursive `assistant` action that applies only when `board === action.snapshot` (`:44`). The production assistant path instead prepares ordinary commands and saves by revision (`frontend/app/page.tsx:124`). `BoardCommand` explicitly excludes the legacy action (`frontend/app/board-commands.ts:3`). Remaining coverage for the action is in reducer tests.

**Suggested change:** remove that obsolete action and tests specific to its reference-equality semantics, then define the public command type directly from the supported domain actions. Keep current revision-based assistant tests.

**Tradeoff:** verify there are no external consumers before removal. It is harmless today, but retaining a second stale-write model makes the authoritative workflow harder to understand.

## Dependency and architecture conclusions

- Runtime packages have clear uses: Next/React, dnd-kit core plus sortable, SQLite, local fonts, icons, environment loading for the database CLI, and the server-only boundary marker. No clearly unused direct runtime dependency or unnecessary overlapping library was found by import inspection.
- Keeping both dnd-kit packages is justified: core supplies drag/drop primitives and sortable supplies ordering behavior. The two local font packages are an intentional design choice, not an established duplicate dependency problem.
- SQLite with synchronous access fits the documented single-instance board. Full-board reads/diffs and several linear scans in `frontend/app/server/db/repository.ts:10` and `:26` are acceptable at this size. Profile larger boards before adding caches, per-command SQL handlers, or a different database.
- Keeping vendor protocol details under `app/server/assistant/` is sound. Do not replace that boundary with provider logic inside chat components.
- The absence of accounts is approved scope, and README explicitly assigns access controls to deployment. It is not a missing MVP feature. Live collaboration, search, and additional management features are not recommended by this review.
- Framework and native dependency compatibility was not independently established by a fresh production build or container run. No claim is made that the manifests use the latest available versions. The existing unit run confirms the installed test stack and SQLite bindings work on this machine's Node.js `24.11.1`.

## Suggested order

1. Fix R1 and R2 together by defining consistent limits and preserving rejected drafts. Add targeted boundary/recovery tests.
2. Isolate ordinary E2E startup (R3) before relying on the suite during refactoring.
3. Resolve the development dependency advisory in a separate maintenance change (R4).
4. Establish/enforce deployment request limits (R5), based on the actual proxy setup.
5. Apply O1/O2 incrementally, then remove the obsolete action (O3). Preserve current architecture and behavior.

## Verification and limitations

- `npm test`: passed, 13 test files and 238 tests. Responses were controlled; no live inference was called.
- `npm run lint`: passed.
- Full `npm audit --json --ignore-scripts`: completed after rerunning with network access; exit 1, seven moderate package entries, zero high/critical. The first restricted-network attempt could not reach the audit endpoint. No `audit fix`, installation, or upgrade was run.
- Production-only `npm audit --omit=dev --json --ignore-scripts`: passed, zero reported vulnerabilities. Advisory details were also checked against the linked GitHub-reviewed advisory.
- Static inspection covered application modules, API/database/provider tests, browser fixtures/scenarios, configs, startup/backup scripts, and documentation. The report focuses on evidenced risks rather than restating every implementation detail.
- No ordinary E2E suite was launched because of R3. Browser suites, coverage, type checking, production build, Docker, restart/restore flows, and a live provider smoke test were not run for this review. Existing tests were inspected, but their presence is not represented as a fresh browser/deployment pass.
- No secrets, active database, or private board content were read. No automated exploit, load test, or exhaustive transitive dependency source audit was performed. Dependency findings reflect the registry/advisory data available on the review date.
- Findings distinguish code-path evidence from executed reproduction. Recommendations are proposals; only this report was created.
