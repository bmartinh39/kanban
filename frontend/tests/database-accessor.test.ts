import { afterEach, expect, it, vi } from "vitest";
import { openDatabase } from "../app/server/db/connection";

vi.mock("server-only", () => ({}));
vi.mock("../app/server/db/connection", () => ({ openDatabase: vi.fn(() => ({ connection: "shared" })) }));
vi.mock("../app/server/db/repository", () => ({ boardRepository: vi.fn(db => ({ db })) }));

const cache = globalThis as typeof globalThis & { kanbanDatabase?: unknown };
afterEach(() => { delete cache.kanbanDatabase; vi.clearAllMocks(); });

it("reuses the connection but refreshes command handlers after a module reload", async () => {
  const original = await import("../app/server/db");
  const first = original.getBoardRepository();
  vi.resetModules();
  const refreshed = await import("../app/server/db");
  const next = refreshed.getBoardRepository();
  expect(next).not.toBe(first);
  expect(next).toEqual(first);
  expect(openDatabase).toHaveBeenCalledTimes(1);
});
