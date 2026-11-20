import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, resolve } from "node:path";
import type { Reporter } from "@playwright/test/reporter";

export default class DatabaseCleanup implements Reporter {
  constructor(private options: { databaseDirectory: string }) {}

  // Playwright calls onExit after its webServer teardown, including failed runs.
  async onExit() {
    const directory = resolve(this.options.databaseDirectory);
    if (dirname(directory) !== resolve(tmpdir()) || !basename(directory).startsWith("kanban-ui-")) {
      throw new Error("Refusing to remove a directory outside the UI test temporary database.");
    }
    await rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    delete process.env.KANBAN_UI_DATABASE_DIRECTORY;
  }
}
