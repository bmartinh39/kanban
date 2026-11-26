import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.test.{ts,tsx}"],
    coverage: {
      provider: "v8",
      include: ["app/**/*.{ts,tsx}"],
      // Floors only for the contracts TESTING.md calls out; UI and glue code are judged by behavior tests.
      thresholds: {
        "app/{board-commands,board-state,assistant-commands}.ts": { lines: 95, functions: 95, branches: 90 },
        "app/server/**/*.ts": { lines: 95, functions: 95, branches: 90 },
        "app/api/**/*.ts": { lines: 95, functions: 95, branches: 90 },
      },
    },
  },
});
