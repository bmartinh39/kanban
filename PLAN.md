# Kanban MVP implementation plan

Scope: one client-rendered board, exactly five renameable columns, and cards containing only a title and details. Users can add cards, delete cards, and drag cards between columns. State lives in memory and resets to dummy data on reload. No accounts, backend, persistence, search, filters, or archive.

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


## Verification results

- Implemented in `frontend` with Next.js 16.4.6 and React 19.3.0; dependencies are locked. ESLint 9 and jsdom 29 are the compatible releases for the installed Next.js plugins and Node.js 24.11 environment.
- Lint, TypeScript checks, and production build pass.
- 26 unit/component tests pass: 98.7% line, 95.12% statement, 91.83% function, and 88.23% branch coverage. State operations and keyboard coordinate logic have full coverage.
- All 30 Playwright scenarios pass against the production build across desktop Chromium, Firefox, and mobile Chromium. Desktop/mobile screenshots were visually reviewed.
- Fixed dialog autofocus, focus return, keyboard focus cycling, and keyboard dragging across a horizontally scrolling board. Browser tests verify those behaviors.
- Production dependency audit is clean. npm reports seven moderate advisories in transitive development lint dependencies; available automatic fixes did not resolve them.
- Production server left running at http://127.0.0.1:3000; HTTP readiness verified. The separate in-app preview browser could not open because its access host is unavailable; Playwright browser verification completed successfully.

### Review follow-up

- Confirmed the `Card` export syntax fix; type checking, all 26 unit/component tests, lint, and the production build pass.
- Keyboard browser tests now wait for the destination highlight after horizontal scrolling before dropping, rather than racing the asynchronous drop-target update.
- All 30 browser tests pass against the development server across desktop Chromium, Firefox, and mobile Chromium. Firefox requires running the browser suite outside the restricted sandbox; its page-launch crashes do not reproduce there.
- The local development server responds with HTTP 200 at http://localhost:3000.
