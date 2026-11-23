# Plan and decisions

Outstanding work is tracked in [GitHub Issues](https://github.com/bmartinh39/kanban/issues). Requirements and approved scope are in `AGENTS.md`; testing policy is in `TESTING.md`. Per-task verification belongs in the pull request description, not in this file. The earlier per-issue verification log is preserved in Git history (this file at commit `453980a`).

For a new multi-phase task, add a short section here with checkbox phases and success criteria, and remove it once the work is merged. Keep only lasting decisions below.

## Decision: SQLite persistence (issue #5)

- SQLite through `better-sqlite3` inside the Next.js Node.js server; prepared SQL and numbered migrations in `frontend/app/server/db/connection.ts`, no ORM or separate service. `node:sqlite` was rejected while experimental.
- Fits one shared board with short, infrequent writes on one host. Reconsider PostgreSQL when the app needs multiple replicas/hosts or sustained concurrent writers; card count alone is not a trigger.
- A singleton `board_state` row holds the revision and marks first-run initialization, so an emptied board is never reseeded. Card and column positions are contiguous integers maintained transactionally.
- Known limits: no cross-tab push updates, offline queue, chat persistence, or authentication. Other tabs see changes on reload; stale writes return HTTP 409.

## Known maintenance

- The development dependency audit has reported moderate advisories in transitive lint dependencies; the production audit was clean. Recheck when upgrading tooling.
- `npm run lint` reports an unused `GripVertical` import warning.
