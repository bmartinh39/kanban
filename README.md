# Forma Kanban

A single-board Next.js app starting with five renameable lists, list/card creation and deletion, pointer/keyboard sorting, and an AI assistant. Lists wrap into rows with vertical page scrolling. The shared board persists in SQLite; chat resets on reload.

Requires Node.js 24.11+ and npm.

Use Add list to create a stage. Each list has a delete icon and asks for confirmation before deleting the list and its cards, using a desktop dialog or mobile bottom sheet.

```powershell
cd frontend
npm ci
npm run dev
```

Open http://localhost:3000. Drag a card into the gap at any position in another column. On a card's handle, use Space to pick up/drop, Left/Right to change columns, Up/Down to choose a position, and Escape to cancel. Changes save automatically. Conflicting saves reload the latest board for review; other tabs refresh on reload.

`npm run dev` and `npm start` run migrations and seed dummy data once. `DATABASE_PATH` defaults to `./data/kanban.sqlite`. An empty saved board is never reseeded. Keep database files out of Git.

Copy `frontend/.env.example` to `frontend/.env.local` to configure AI. Set `AI_PROVIDER` (`openai` or `openrouter`), `AI_MODEL`, and the selected provider's `OPENAI_API_KEY` or `OPENROUTER_API_KEY`. Restart/redeploy after changes. The example pins `openrouter` / `nvidia/nemotron-3.5-super-vl:free`; no model/provider fallback occurs. Legacy `OPENAI_MODEL` applies only to OpenAI when `AI_MODEL` is unset. Without a key the board still works. Keys stay server-side, never in `NEXT_PUBLIC_`, logs, commits, or images.

AI needs outbound HTTPS from the Node.js server. If it cannot reach the provider, restart the server in an environment with internet access; loading the board alone does not verify AI connectivity.

The assistant can create, edit, and move cards, and create, rename, or delete lists. List deletion always asks for confirmation, including empty lists; Cancel leaves the whole request unapplied. To add cards to a newly created list, send a follow-up request. Providers implement `AssistantProvider.generatePlan`; current OpenAI/OpenRouter protocols live in `app/server/assistant/`. Proposals use the saved board revision and commit atomically. Recent chat and board content go to the selected provider with `store: false`; upstream retention depends on the provider.

For task-based checks and full verification, see [TESTING.md](TESTING.md). During development, from `frontend`:

```powershell
npm run lint
npm run typecheck
npm test -- tests/board-state.test.ts
npm run test:e2e:chromium -- e2e/board.spec.ts --grep "creates cards"
```

UI suites use controlled APIs and start their own server on port 3210 (`PLAYWRIGHT_PORT` overrides it), with a separate Next.js cache and a temporary database removed after shutdown. An occupied port fails instead of reusing another server; live AI keys are cleared. The persistence suite starts a production server on port 3220 with a temporary real database; build first. Suite artifacts are separate under `test-results/ui` and `test-results/persistence`. Browser coverage includes Chromium, Firefox, and mobile Chromium. Automated tests never call paid inference.

Deploy on a VPS with Docker Compose, from the repository root:

```powershell
docker compose up -d --build
```

The app binds to localhost:3000 for a reverse proxy. Pass AI settings/secrets through the hosting environment or a local root `.env` file (ignored). One application instance uses the named `kanban-data` volume mounted at `/data`, including SQLite WAL/SHM files. Deleting that volume deletes saved data. Use local disk; consider PostgreSQL when multiple hosts or sustained concurrent writers are needed. There are no accounts; deployment access controls remain external.

Create a consistent live backup and copy it off the VPS (create the local `backups` folder first):

```powershell
docker compose exec kanban npm run db:backup -- /data/backup.sqlite
docker compose cp kanban:/data/backup.sqlite ./backups/board.sqlite
```

For local development: `npm run db:backup -- ./data/backup.sqlite` from `frontend`. Never copy the active database file alone while it is running.

To restore, stop the application, use a fresh Compose project/empty volume, create its stopped container, copy the backup, then start it. Keep the old project/volume until verification succeeds:

```powershell
docker compose stop kanban
docker compose -p kanban-restore create --build kanban
docker compose -p kanban-restore cp ./backups/board.sqlite kanban:/data/kanban.sqlite
docker compose -p kanban-restore run --rm --no-deps --user root --entrypoint chown kanban node:node /data/kanban.sqlite
docker compose -p kanban-restore up -d
```

Use a new project name if `kanban-restore` already contains data. For non-Docker hosting, run `npm run build` then `npm start` with a writable persistent database directory; static export is unsupported.
