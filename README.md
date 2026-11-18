# Forma Kanban

A single-board Next.js app with five renameable columns, card creation/deletion, and pointer/keyboard drag-and-drop. Data lives in memory and resets on reload.

Requires Node.js 24.11+ and npm.

```powershell
cd frontend
npm ci
npm run dev
```

Open http://localhost:3000. On a card's drag handle, press Space to pick up, Left/Right to move between columns, Space to drop, or Escape to cancel.

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
