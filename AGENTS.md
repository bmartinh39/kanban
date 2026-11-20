# Kanban Project

## Business Requirements

- An MVP of a Kanban style Project Management application as a web app  
- The web app should only have 1 board
- The board has fixed 5 columns that can be renamed  
- Each card has a title and details only
- Drag and drop interface to move cards between columns
- Add a new card to a column; delete an existing card
- No more functionality: no archive, no search/filter. Keep it simple.
- The priority is a slick, professional, gorgeous UI/UX with very simple features
- The app should open with dummy data populated for the single board

## Technical Details

- Implemented as a modern NextJS app, client rendered
- The NextJS app should be created in a subdirectory `frontend`
- No persistence
- No user management for the MVP
- Use popular libraries
- As simple as possible but with an elegant UI

## Approved follow-up scope

The requirements above describe the original MVP. These implemented follow-ups extend that baseline:

- Cards can be reordered within a column using pointer or keyboard controls.
- An in-app AI assistant can create cards, edit titles/details, and move cards between existing columns. It can create, rename, and delete lists; every proposed list deletion requires the app's explicit confirmation dialog before the entire revision-checked batch is saved. It cannot delete individual cards.
- The assistant stays visible on the right on desktop and docked below the board on narrow screens. Lists wrap into responsive rows with normal vertical page scrolling; reserve space for the mobile assistant so it does not cover the final controls. Use icons and a visible AI label to identify it.
- Issue #5 supersedes the MVP persistence restriction: the shared board is stored in SQLite and survives reloads and server/container restarts. Chat remains in memory and resets on reload. Deployments run a Next.js Node.js server rather than a static export.
- Issue #3 supersedes the fixed-five constraint: users can create named lists through the board UI. Start with the same five dummy-data lists and persist additional lists through the revision-checked API. Every list has a delete icon and always requires confirmation, including empty lists. Confirmed deletion atomically removes its cards too. Use the approved centered desktop dialog and bottom sheet on mobile, with the project palette and fade-in/fade-out animation that respects reduced motion. Empty boards are allowed and never reseeded. The assistant uses the same confirmation design for list deletion.
- Ask the user to approve material design/interaction choices before implementing them (for example, choosing a mobile bottom sheet instead of a centered popup). Routine fixes within an already approved design can proceed.

## Assistant architecture and configuration

- Keep chat UI and board operations independent of AI vendors. The API route uses `AssistantProvider.generatePlan`; provider protocols belong in `frontend/app/server/assistant/`.
- OpenAI and OpenRouter currently share the Responses API adapter. Add an adapter implementing the interface for a new protocol, and register it in `providers.ts`.
- Select supported providers and models with `AI_PROVIDER` and `AI_MODEL`, followed by a server restart or redeploy. Switching an existing provider/model must not require application code changes.
- The checked-in example pins `AI_PROVIDER=openrouter` and `AI_MODEL=nvidia/nemotron-3.5-super-vl:free`. Keep an explicit model selection for predictable behavior. Verify current endpoint availability and JSON-schema support before choosing another model; a model page alone does not prove an active endpoint exists.
- Store real keys only in the ignored `frontend/.env.local` or hosting secrets. OpenAI uses `OPENAI_API_KEY`; OpenRouter uses `OPENROUTER_API_KEY`. `.env.example` must contain empty key placeholders. Never expose keys through `NEXT_PUBLIC_`, logs, browser responses, or commits.
- `AI_MODEL` takes precedence over defaults. Legacy `OPENAI_MODEL` applies only to OpenAI. Read only the selected provider's key and never silently fall back to another model or provider.
- Treat model output as untrusted: validate its schema and every target before applying the complete batch. Ambiguous/invalid requests must leave the board unchanged. Reject responses if the board snapshot changed while waiting.
- Retain card IDs and content during edits/moves. The database is authoritative. The assistant reads a saved snapshot and proposes actions with its revision; the server validates and commits the entire batch only against that revision. Keep provider errors free of credentials and upstream private details.

## Database and deployment

- Use SQLite with `better-sqlite3`, prepared SQL, numbered migrations, and a singleton board revision. Keep database access server-only under `frontend/app/server/db/`.
- `DATABASE_PATH` defaults to `./data/kanban.sqlite` locally and `/data/kanban.sqlite` in Docker. Keep the database directory on local persistent storage; mount the entire directory for WAL/SHM files.
- `npm run dev` and `npm start` migrate/seed before serving traffic. Seed dummy data only on first initialization; never reseed an emptied board. Builds must not open the deployment database.
- Board mutations and assistant batches share the revision-checked transactional API. HTTP 409 means reload and review; never silently replay or overwrite stale changes. Keep drag previews local and save once on drop.
- Use the backup command for live backups; restore into an empty volume while the app is stopped. Database files, sidecars, backups, and environment secrets must remain untracked.
- Test with isolated temporary databases and controlled AI responses. No database reset endpoint or production test data. Chat persistence, accounts, and live collaboration remain outside issue #5; list creation is covered by issue #3.

## Verification strategy

Follow `TESTING.md` for the task-to-test matrix and commands (run from `frontend`). This policy supersedes blanket full-suite requirements in historical `PLAN.md` entries and the original MVP strategy below.

- During iteration, run named unit/component/API tests without coverage and only the browser scenarios affected by the change. Use `npm run test:watch -- <test-file>` for repeated edits. Include callers/shared contracts when selecting tests; do not rely on changed filenames alone.
- Before completing a code task, run lint, type checking, the affected tests, and `git diff --check`. Documentation-only changes need link/command/diff review, not application suites. Test-tooling changes need checks of the changed runner and isolation behavior.
- Start browser checks with focused Chromium scenarios. Add mobile for responsive layout, scrolling, touch, or docked controls; add Firefox for drag/drop, focus, keyboard, native dialogs, animation, or browser-specific behavior. Pure server logic needs no browser run unless its UI contract changes.
- Run focused real-SQLite persistence browser checks for storage, mutation/revision handling, assistant commit integration, or startup changes. Build once first. Do not build or run persistence tests for a CSS/text-only fix.
- Before merging a substantive code branch or releasing, run lint, types, full coverage with existing thresholds, all UI browser projects, one production build, and the persistence suite in Chromium. Run all persistence browser projects when browser-sensitive persistence interactions change. For a small isolated fix, focused completion checks suffice; document the scope and omitted broad suites.
- After a passing check, rerun it only when later changes can affect its result. Fixes require the failing regression plus related behavior, not an automatic restart of the entire checklist. Leave/restart the local server only when application work requires a user handoff, not for documentation/test-strategy tasks.

- Use the same contract tests for every provider, including model/key selection, configuration failures, malformed output, refusals, and upstream errors. Unit and browser suites must use controlled responses rather than making paid inference calls.
- Select browser projects using the policy above. Keep pointer coordinates within the actual visible board frame; scrolling and sorting previews can invalidate earlier measurements.
- For a live provider smoke test, use synthetic board data, the explicitly selected model, and the server route. Report live-provider checks separately from mocked coverage. Do not infer that another adapter works live from one provider's success.
- Start the local app server with outbound HTTPS access when handing off a working live assistant. A server launched inside a network-restricted sandbox can serve the board while all AI requests fail; HTTP readiness and mocked browser tests do not verify provider connectivity.
- Check `git diff --check` and verify no secret values are staged before committing. Record meaningful verification and known limitations in `PLAN.md`; keep `README.md` concise.

## Color Scheme

- Accent Yellow: `#ecad0a` - accent lines, highlights
- Blue Primary: `#209dd7` - links, key sections
- Purple Secondary: `#753991` - submit buttons, important actions
- Dark Navy: `#032147` - main headings
- Gray Text: `#888888` - supporting text, labels

## Strategy

1. Write plan with success criteria for each phase to be checked off. Include project scaffolding, including .gitignore, and rigorous unit testing.
2. Execute the plan ensuring all critiera are met
3. Carry out extensive integration testing with Playwright or similar, fixing defects
4. Only complete when the MVP is finished and tested, with the server running and ready for the user

## Coding standards

1. Use latest versions of libraries and idiomatic approaches as of today
2. Keep it simple - NEVER over-engineer, ALWAYS simplify, NO unnecessary defensive programming. No extra features - focus on simplicity.
3. Be concise. Keep README minimal. IMPORTANT: no emojis ever
