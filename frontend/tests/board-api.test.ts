import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { openDatabase } from "../app/server/db/connection";
import { boardRepository } from "../app/server/db/repository";
import { getBoardRepository } from "../app/server/db";
import { GET } from "../app/api/board/route";
import { POST } from "../app/api/board/actions/route";

vi.mock("../app/server/db", () => ({ getBoardRepository: vi.fn() }));
const request = (body: unknown, headers = { origin: "http://localhost" }) => new Request("http://localhost/api/board/actions", { method: "POST", headers, body: JSON.stringify(body) });
let db: ReturnType<typeof openDatabase>;
beforeEach(() => { db = openDatabase(":memory:", true); vi.mocked(getBoardRepository).mockReturnValue(boardRepository(db)); });
afterEach(() => { db.close(); vi.restoreAllMocks(); });

describe("board HTTP API", () => {
  it("deletes lists and their cards atomically, and rejects stale list deletion", async () => {
    const before = await GET().json();
    const response = await POST(request({ revision: 0, actions: [{ type: "delete-list", columnId: "ideas" }] }));
    expect(response.status).toBe(200);
    expect((await response.json()).columns).toEqual(before.columns.slice(1));
    expect((await POST(request({ revision: 0, actions: [{ type: "delete-list", columnId: "planned" }] }))).status).toBe(409);
    expect((await GET().json()).columns).toEqual(before.columns.slice(1));
  });
  it("creates empty lists, then renames and uses them in an atomic saved batch", async () => {
    const created = await POST(request({ revision: 0, actions: [{ type: "create-list", listId: "new-list", name: "  Released  ", color: "#6fd6a8" }] }));
    expect(created.status).toBe(200);
    expect((await created.json()).columns[5]).toEqual({ id: "new-list", name: "Released", color: "#6fd6a8", cards: [] });
    const response = await POST(request({ revision: 1, actions: [
      { type: "rename", columnId: "new-list", name: "Shipped" },
      { type: "add", columnId: "new-list", card: { id: "new-card", title: "Test", details: "Context" } },
      { type: "move", cardId: "c1", columnId: "new-list", index: 0 },
    ] }));
    expect(response.status).toBe(200);
    const saved = await GET().json();
    expect(saved.revision).toBe(2);
    expect(saved.columns[5].name).toBe("Shipped");
    expect(saved.columns[5].cards.map((card: { id: string }) => card.id)).toEqual(["c1", "new-card"]);
    expect((await POST(request({ revision: 0, actions: [{ type: "create-list", listId: "stale", name: "Stale", color: "#6fd6a8" }] }))).status).toBe(409);
    expect(await GET().json()).toEqual(saved);
  });
  it("accepts the browser's Host address when Next normalizes its internal URL", async () => {
    const response = await POST(new Request("http://localhost:3000/api/board/actions", {
      method: "POST", headers: { host: "127.0.0.1:3230", origin: "http://127.0.0.1:3230" },
      body: JSON.stringify({ revision: 0, actions: [] }),
    }));
    expect(response.status).toBe(200);
  });
  it("reads uncached state and saves a validated batch", async () => {
    expect(GET().headers.get("cache-control")).toBe("no-store");
    const before = await GET().json();
    expect(before.revision).toBe(0);
    const response = await POST(request({ revision: 0, actions: [{ type: "delete", cardId: "c1" }] }));
    expect(response.status).toBe(200);
    expect((await response.json()).revision).toBe(1);
    expect((await GET().json()).columns[0].cards).toHaveLength(2);
  });
  it("sets and clears a card priority through the saved API", async () => {
    const prioritized = await POST(request({ revision: 0, actions: [{ type: "set-priority", cardId: "c1", priority: "medium" }] }));
    expect(prioritized.status).toBe(200);
    expect((await prioritized.json()).columns[0].cards[0].priority).toBe("medium");
    const cleared = await POST(request({ revision: 1, actions: [{ type: "set-priority", cardId: "c1", priority: null }] }));
    expect(cleared.status).toBe(200);
    const card = (await cleared.json()).columns[0].cards[0];
    expect(card).not.toHaveProperty("priority");
    expect((await GET().json()).columns[0].cards[0]).toEqual(card);
  });
  it("returns a conflict without overwriting saved changes", async () => {
    await POST(request({ revision: 0, actions: [{ type: "delete", cardId: "c1" }] }));
    expect((await POST(request({ revision: 0, actions: [{ type: "delete", cardId: "c2" }] }))).status).toBe(409);
    expect((await GET().json()).columns[0].cards).toHaveLength(2);
  });
  it.each([
    null, {}, { revision: -1, actions: [] }, { revision: 0, actions: {} }, { revision: 0, actions: [null] },
    { revision: 0, actions: Array(21).fill({ type: "delete", cardId: "c1" }) },
    ...[
      { type: "delete-list", columnId: "" }, { type: "delete-list", columnId: "missing" }, { type: "delete-list", columnId: 4 },
      { type: "create-list", listId: "", name: "List", color: "#6fd6a8" }, { type: "create-list", listId: "x", color: "#6fd6a8" },
      { type: "create-list", listId: "x", name: 42, color: "#6fd6a8" }, { type: "create-list", listId: "x", name: " \t ", color: "#6fd6a8" },
      { type: "create-list", listId: "ideas", name: "Duplicate ID", color: "#6fd6a8" }, { type: "create-list", listId: "c1", name: "Card ID", color: "#6fd6a8" },
      { type: "assistant", actions: [] }, { type: "delete", cardId: "" }, { type: "delete", cardId: "missing" },
      { type: "add", columnId: "ideas", card: { id: "c1", title: "Duplicate", details: "" } },
      { type: "add", columnId: "ideas", card: { id: "ideas", title: "Duplicate", details: "" } },
      { type: "add", columnId: "missing", card: { id: "new", title: "Title", details: "" } },
      { type: "add", columnId: "ideas", card: { id: "new", title: "  ", details: "" } },
      { type: "add", columnId: "ideas", card: { id: "new", title: "Title" } },
      { type: "add", columnId: "ideas", card: { id: "new", title: "Title", details: "", priority: null } },
      { type: "set-priority", cardId: "c1", priority: "other" }, { type: "set-priority", cardId: "c1" },
      { type: "set-priority", cardId: "missing", priority: "medium" },
      { type: "edit", cardId: "c1" }, { type: "edit", cardId: "c1", title: " " }, { type: "edit", cardId: "c1", details: 4 },
      { type: "rename", columnId: "ideas", name: " " }, { type: "rename", columnId: "ideas", name: 4 },
      { type: "move", cardId: "c1", columnId: "ideas", index: -1 }, { type: "move", cardId: "c1", columnId: "ideas", index: 3 },
      { type: "move", cardId: "c1", columnId: "done", index: 3 }, { type: "move", cardId: "c1", columnId: "done", index: 0.5 },
    ].map(action => ({ revision: 0, actions: [action] })),
  ])("rejects invalid commands without writes: %j", async body => {
    expect((await POST(request(body))).status).toBe(400);
    expect((await GET().json()).revision).toBe(0);
  });
  it("rejects malformed JSON, oversized bodies, and cross-origin writes", async () => {
    expect((await POST(new Request("http://localhost/api/board/actions", { method: "POST", body: "{" }))).status).toBe(400);
    expect((await POST(request({ padding: "a".repeat(200_001) }))).status).toBe(413);
    expect((await POST(request({}, { origin: "https://other.example" }))).status).toBe(403);
    expect((await POST(request({}, { "sec-fetch-site": "cross-site" } as unknown as { origin: string }))).status).toBe(403);
  });
  it("hides private storage errors from reads and writes", async () => {
    vi.mocked(getBoardRepository).mockImplementation(() => { throw new Error("private/path secret"); });
    expect(GET().status).toBe(503);
    const response = await POST(request({ revision: 0, actions: [] }));
    expect(response.status).toBe(503);
    expect(JSON.stringify(await response.json())).not.toContain("private");
  });
});
