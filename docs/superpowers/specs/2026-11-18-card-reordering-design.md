# Issue #1: Card reordering

Status: approved on 2026-11-18 and verified on `feat/issue-1-card-reordering`. Scoped re-review of the final fixes and integration are pending. The branch remains unmerged and the issue is open.

Issue: https://github.com/bmartinh39/kanban/issues/1

## Goal and scope

Allow users to reorder cards within a column using the existing drag handle, with smooth visual feedback and equivalent keyboard controls. Preserve card IDs, titles, details, and counts. Keep one board, five columns, in-memory state, and existing add/delete/rename behavior. AI assistance and new lists belong to separate issues.

## Approaches

- Selected by the user: add `@dnd-kit/sortable` alongside the existing `@dnd-kit/core`, using a vertical `SortableContext` per column and `useSortable` for cards. This provides sorting previews and reduces custom animation code.
- Alternative: extend the current draggable cards with custom card drop targets and positioning logic. Avoids another package, but requires more custom sorting behavior and animation code.

## Proposed behavior

- Pointer: drag a card to the beginning, middle, or end of its current column. Neighboring cards shift to preview its new position; releasing commits the order.
- Keyboard: Space picks up/drops a card; Up/Down moves it one position within the column; Left/Right retains movement between columns; Escape cancels. Provide accessible instructions and announce the card title, current column name, and one-based position and count on pickup, target change, drop, and cancellation. Outside drops and cancellations announce the saved position. Keep keyboard focus on the moved card's handle after dropping.
- Up/Down at a list boundary does nothing. Dropping outside a valid target or cancelling leaves the saved order unchanged.
- Cross-column moves continue to append to the destination, including empty columns, as in the current app. Positioning a card within its destination is available through same-column reordering afterward.
- Reloading restores the original dummy data, as today.

## Implementation direction

Keep the current reducer and card model. Extend the move action with an optional destination index for same-column reordering; omit it to retain existing cross-column append behavior. Register sortable cards separately from column drop targets, and resolve collisions so the surrounding column does not mask its cards. Use sortable transforms/transitions for previews and commit board state only on a completed drop, making cancellation a no-op. Keep the drag overlay.

Retain a board-aware keyboard coordinate getter: vertical keys select neighboring card positions; horizontal keys select adjacent columns and account for horizontal scrolling. Exact collision rules, focus restoration, and helper structure are implementation choices, to be verified in real browsers.

## Verification

Write failing tests before implementation. Reducer tests cover first/middle/last placement, boundaries/no-ops, immutability, and preserved content/counts. Browser tests verify pointer and keyboard ordering, cancellation, focus, and cross-column moves into populated and empty columns across desktop Chromium, Firefox, and mobile Chromium. Synchronize tests on visible drag feedback rather than fixed delays. Run lint, type checking, the full unit/browser suites, and a production build. Update `PLAN.md` with results and leave the app running. The final fixes passed 56 unit and component tests and 45 browser cases with zero skips, including live-region assertions for a newly created card in a renamed column.
