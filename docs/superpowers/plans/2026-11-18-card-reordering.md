# Card Reordering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement GitHub issue #1: reorder cards within a column with pointer and keyboard controls.

**Architecture:** Retain the reducer and in-memory board. Add an optional same-column destination index to move actions, one vertical sortable context per column, and sortable cards. Preview changes through sortable transforms; commit order only on drop.

**Tech Stack:** Existing Next.js, React, TypeScript, `@dnd-kit/core`, Vitest, and Playwright; add a compatible `@dnd-kit/sortable` release and its transform utility if directly imported.

**Spec:** [Approved card-reordering design](../specs/2026-11-18-card-reordering-design.md).

## Global Constraints

- Keep one board, five columns, in-memory state, and existing add/delete/rename behavior.
- Preserve card IDs, titles, details, and counts.
- Space picks up/drops; Up/Down reorders; Left/Right changes columns; Escape cancels.
- Cross-column moves append to the destination, including empty columns.
- Cancelling or dropping outside a valid target leaves saved order unchanged.
- Reloading restores dummy data. AI assistance and new lists remain separate issues.
- Preserve the pre-existing uncommitted `PLAN.md` backlog edits.

## Review Focus

- Unequal card heights: pointer targets reflect the visible cards, without jumping between nested drop targets.
- First/last/single-card positions: vertical keys stop at boundaries and do not switch columns.
- Narrow horizontally scrolled boards: keyboard moves reach the correct column and retain focus.
- Cancel/outside drop after preview: saved order and content remain unchanged.
- Empty destination: cross-column append still works, without a card target to collide with.

## File Responsibilities

- `frontend/app/board-state.ts`: immutable indexed reorder operation.
- `frontend/app/page.tsx`: sortable contexts/cards, focus, accessible instructions, and drag event handling.
- `frontend/app/drag-announcements.ts`: shared drop resolution and accessible drag announcements.
- `frontend/app/keyboard-coordinates.ts`: card-aware vertical and column-aware horizontal coordinates.
- `frontend/app/drag-collision.ts` (new): resolve card versus column targets without masking cards.
- `frontend/package.json`, `frontend/package-lock.json`: compatible sortable dependencies.
- `frontend/tests/board-state.test.ts`, `frontend/tests/keyboard-coordinates.test.ts`, `frontend/tests/drag-collision.test.ts` (new): state and target selection tests.
- `frontend/e2e/reorder.spec.ts` and `frontend/e2e/board.spec.ts`: pointer and keyboard order, cancellation, focus, and board regressions.
- `README.md`, `PLAN.md`: keyboard documentation and verified status.

### Task 1: Indexed moves in board state

**Interface:** Extend `Action`'s move variant to `{ type: "move"; cardId: string; columnId: string; index?: number }`. `index` denotes the card's final zero-based position within its current column; omit it for unchanged same-column drops or cross-column append. `boardReducer(board: Column[], action: Action): Column[]` remains the public reducer.

- [x] Add failing parameterized tests moving `c1` to index 2 (`c2,c3,c1`), `c3` to index 0 (`c3,c1,c2`), and `c1` to index 1 (`c2,c1,c3`). Assert preserved objects/content, total count, original seed order, and unchanged unrelated column references.
- [x] Add tests for dropping at the existing index, first/last boundaries, and a single-card column. Keep the existing no-index same-column no-op and repeated cross-column moves tests.
- [x] Run `npm test -- tests/board-state.test.ts` from `frontend`; verify new reorder assertions fail before implementation.
- [x] Implement the indexed same-column branch using a copied card array, retaining existing cross-column append semantics. Do not mutate the seed or store an order field on cards.
- [x] Rerun the state tests; require all assertions to pass. Commit only task-related files.

### Task 2: Sortable drag behavior and keyboard targets

**Interfaces:** Retain the exported `columnCoordinates: KeyboardCoordinateGetter`, now supporting vertical card positions. Add `boardCollisionDetection: CollisionDetection` in `drag-collision.ts`. Column droppables expose `{ type: "column", columnId, index }`; sortable cards expose `{ type: "card", columnId }` alongside sortable metadata. Resolve card targets to their owning column and final card index on drop; only same-column moves supply the index to Task 1's action.

- [x] Add failing coordinate tests: Up/Down select adjacent cards; first/last/single-card boundaries return current coordinates; Left/Right select adjacent columns even when `over` is a card; unrelated keys and unmeasured targets do not move.
- [x] Add failing collision tests: source-column card targets win over their parent; other columns remain valid append targets; an empty column is targetable; pointer outside the board returns no target. Assert the returned target ID, not implementation call counts.
- [x] Add failing browser tests for keyboard reorder and pointer reorder before changing UI behavior. Assert card IDs in DOM order: `c1,c2,c3` becomes `c2,c1,c3`, then `c2,c3,c1`, then back to `c1,c2,c3`. Include unequal-height cards and assert unchanged IDs/content/counts.
- [x] Run the targeted unit tests and Chromium reorder tests; confirm failures demonstrate missing behavior rather than test setup errors.
- [x] Read the relevant installed Next.js client-component guidance and official dnd-kit sortable guidance. Install a release compatible with the existing core library; commit dependency metadata with this task.
- [x] Replace card `useDraggable` with `useSortable`; add a `SortableContext` using `verticalListSortingStrategy` per column. Apply transforms/transitions and retain the existing drag handle and overlay.
- [x] Implement collision and keyboard interfaces above. Keep board state unchanged during preview; resolve the destination and dispatch on drop only. Restore keyboard focus to the moved handle after drop/cancel, including when a cross-column move remounts it.
- [x] Update screen-reader instructions and README keyboard controls. Synchronize browser actions on drag state/highlights instead of arbitrary delays.
- [x] Run the full unit suite and targeted Chromium reorder tests; require all to pass. Commit task-related files.

### Task 3: Browser regression, review, and handoff

**Interface:** Exercise the user-visible Task 2 controls through Playwright; no new application interfaces.

- [x] Add browser assertions for Escape cancellation after a sorting preview and pointer release outside the board: original card order/content/count remain unchanged.
- [x] Add keyboard assertions for top/bottom boundaries, single-card columns, correct focus after drop/cancel, and movement after horizontal scrolling at the mobile viewport.
- [x] Preserve and extend populated/empty cross-column cases to assert append order, then reorder in the new column. Verify reload restores the seed. Existing creation/deletion/rename tests remain regression coverage.
- [x] Run `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:e2e`, and `npm run build` from `frontend`. Require zero failed tests/checks; browser tests cover Chromium, Firefox, and mobile Chromium. Use authorized browser execution outside the restricted sandbox for Firefox.
- [x] Review desktop/mobile sorting feedback and the diff, address findings, and rerun affected checks.
- [x] Address final review findings: announce drag positions by title and column name, and wait for the Ideas highlight before testing keyboard boundaries.
- [x] Complete the scoped re-review of the final fixes. Both findings were addressed; no new breakage was found.
- [x] Update this plan and `PLAN.md` with actual results; do not mark the issue complete until every acceptance criterion passes. Leave a local server running and verify HTTP readiness.
- [x] Commit the verified implementation and documentation.
- [x] Present the branch and test results for the user's integration decision. The branch is pushed with [PR #4](https://github.com/bmartinh39/kanban/pull/4) open against main. Issue #1 is closed as completed at the user request; merge is pending.

## Verification on the feature branch

- Lint, TypeScript, 56 unit and component tests, and the production build passed.
- All 45 browser cases passed with zero skipped, 15 each in desktop Chromium, Firefox, and mobile Chromium. Playwright ran against the feature server on port 3100.
- The live-region test covers a newly created card in a renamed column, its reorder and drop position, cross-column append preview, and cancellation. Unit tests also cover empty destinations and outside drops.
- Desktop and native-width mobile sorting screenshots were reviewed. They showed a displaced neighbor, an outlined destination column, and a drag overlay.
- Mobile keyboard cancellation now brings the focused handle back into view when the preview scrolled to a different column. The browser test verifies focus and visibility before immediately reusing the handle.
- The feature's production server returned HTTP 200 at http://127.0.0.1:3100.

## Plan Self-Review

All approved behavior maps to a task: indexed ordering and immutability to Task 1; previews, keyboard controls, and instructions to Task 2; cancellation, boundaries, focus, empty/scrolled targets, reset, and regression checks to Tasks 2–3. Interfaces retain the current reducer and keyboard export; metadata distinguishes cards from columns. All five review conditions have explicit tests. Scope excludes issues #2 and #3.
