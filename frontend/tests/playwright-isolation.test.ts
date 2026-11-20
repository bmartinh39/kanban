import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { expect, test, vi } from "vitest";
import DatabaseCleanup from "../scripts/playwright-cleanup";
import { createUiTestServer } from "../scripts/playwright-server";

test("browser startup migrates its own database and leaves an inherited sentinel unchanged", async () => {
  const sentinelDirectory = mkdtempSync(join(tmpdir(), "kanban-sentinel-"));
  const sentinelPath = join(sentinelDirectory, "sentinel.sqlite");
  const sentinel = new Database(sentinelPath);
  sentinel.exec("CREATE TABLE sentinel (value TEXT); INSERT INTO sentinel VALUES ('keep me'); PRAGMA user_version = 73;");
  sentinel.close();
  const before = readFileSync(sentinelPath);
  vi.stubEnv("DATABASE_PATH", sentinelPath);
  vi.stubEnv("OPENAI_API_KEY", "synthetic-openai-key");
  vi.stubEnv("OPENROUTER_API_KEY", "synthetic-openrouter-key");
  const server = createUiTestServer("3210");
  const databasePath = server.env!.DATABASE_PATH;
  const cleanup = new DatabaseCleanup({ databaseDirectory: process.env.KANBAN_UI_DATABASE_DIRECTORY! });
  try {
    expect(server.reuseExistingServer).toBe(false);
    expect(server.env!.OPENAI_API_KEY).toBe("");
    expect(server.env!.OPENROUTER_API_KEY).toBe("");
    // Execute the actual predev migration with the same environment as webServer.
    execFileSync(process.execPath, ["--experimental-strip-types", "scripts/database.ts", "migrate"], {
      cwd: process.cwd(),
      env: { ...process.env, ...server.env },
      stdio: "pipe",
    });
    const database = new Database(databasePath, { readonly: true });
    try {
      expect(database.prepare("SELECT revision FROM board_state").get()).toEqual({ revision: 0 });
      expect(database.prepare("SELECT COUNT(*) AS count FROM columns").get()).toEqual({ count: 5 });
    } finally { database.close(); }
    expect(readFileSync(sentinelPath)).toEqual(before);
    expect(existsSync(sentinelPath + "-wal")).toBe(false);
    expect(existsSync(sentinelPath + "-shm")).toBe(false);
    await cleanup.onExit();
    expect(existsSync(databasePath)).toBe(false);
    expect(readFileSync(sentinelPath)).toEqual(before);
    await expect(new DatabaseCleanup({ databaseDirectory: sentinelDirectory }).onExit()).rejects.toThrow("Refusing to remove");
    expect(existsSync(sentinelPath)).toBe(true);
  } finally {
    await cleanup.onExit();
    rmSync(sentinelDirectory, { recursive: true, force: true });
    vi.unstubAllEnvs();
  }
}, 15_000);
