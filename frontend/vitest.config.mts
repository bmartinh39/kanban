import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.test.{ts,tsx}"],
    coverage: { provider: "v8", include: ["app/board-state.ts", "app/page.tsx", "app/keyboard-coordinates.ts", "app/drag-collision.ts", "app/drag-announcements.ts", "app/assistant-commands.ts", "app/assistant-chat.tsx", "app/api/assistant/route.ts", "app/server/assistant/**/*.ts"], thresholds: { lines: 90, functions: 90, branches: 85, statements: 90 } },
  },
});
