# Forma Kanban

A single-board Next.js app with five renameable columns, card creation/deletion, and pointer/keyboard drag-and-drop. Data lives in memory and resets on reload.

Requires Node.js 24.11+ and npm.

```powershell
cd frontend
npm ci
npm run dev
```

Open http://localhost:3000. On a card's drag handle, press Space to pick up, Up/Down to reorder, Left/Right to move between columns, Space to drop, or Escape to cancel.

Checks (from `frontend`):

```powershell
npm run lint
npm run typecheck
npm run test:coverage
npx playwright install chromium firefox
npm run test:e2e
npm run build
```

Use `npm start` after building to run the production server. Browser tests cover desktop Chromium, Firefox, and mobile Chromium.

The always-visible AI assistant sits beside the board on desktop and below it on mobile. Copy `frontend/.env.example` to `frontend/.env.local` and configure the provider:

| `AI_PROVIDER` | Secret | Default model when `AI_MODEL` is empty |
| --- | --- | --- |
| `openai` (default) | `OPENAI_API_KEY` | `gpt-6-luna` |
| `openrouter` | `OPENROUTER_API_KEY` | `openrouter/free` |

Switch supported providers or models through environment settings, then restart (or redeploy); no code changes are needed. The example pins `AI_PROVIDER=openrouter` and `AI_MODEL=nvidia/nemotron-3.5-super-vl:free`, avoiding automatic model selection. Existing `OPENAI_MODEL` is supported for OpenAI when `AI_MODEL` is unset. OpenRouter models must support JSON schema; routing requires parameter support. Provider errors leave the board unchanged, with no automatic fallback to a paid model or another provider.

The route depends on `AssistantProvider.generatePlan`; the Responses adapter handles both current providers. A provider using a different API implements that interface and is registered in `app/server/assistant/providers.ts`. Board logic and chat UI stay independent of provider protocols.

Each message sends the current board and recent conversation to the selected provider. The app keeps no persistent board/chat state and requests `store: false`; upstream retention policies depend on the provider. Without the selected provider's key, the board works and chat shows a configuration message.

Deploy as a Next.js server (not a static export). Configure `AI_PROVIDER`, optional `AI_MODEL`, and the selected provider's key in the hosting environment; redeploy after changes. Keys belong in server-side secrets, never `NEXT_PUBLIC_` variables or `.env.example`. This MVP has no accounts: only enable the paid assistant in a trusted deployment; authentication and public-use quotas require separate scope.
