import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export function createUiTestServer(port: string) {
  // Workers inherit the runner's directory instead of allocating their own.
  const directory = process.env.KANBAN_UI_DATABASE_DIRECTORY ?? mkdtempSync(join(tmpdir(), "kanban-ui-"));
  process.env.KANBAN_UI_DATABASE_DIRECTORY = directory;
  return {
    command: `npm run dev -- --hostname 127.0.0.1 --port ${port}`,
    url: `http://localhost:${port}`,
    reuseExistingServer: false,
    env: {
      KANBAN_UI_TEST: "1",
      DATABASE_PATH: join(directory, "board.sqlite"),
      OPENAI_API_KEY: "",
      OPENROUTER_API_KEY: "",
    },
    timeout: 120000,
  };
}
