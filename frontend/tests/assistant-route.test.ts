import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "../app/api/assistant/route";
import { initialBoard } from "../app/board-state";
import * as providers from "../app/server/assistant/providers";

const command = { type: "create", list: "Ideas", sourceList: null, card: null, title: "Launch", details: null };
let databaseBoard = initialBoard;
let databaseRevision = 0;
vi.mock("../app/server/db", () => ({ getBoardRepository: () => ({ read: () => ({ columns: databaseBoard, revision: databaseRevision }) }) }));
const payload = { revision: 0, messages: [{ role: "user", content: "Create Launch in Ideas" }] };
const request = (body: unknown = payload) => new Request("http://localhost:3000/api/assistant", {
  method: "POST", headers: { origin: "http://localhost:3000" }, body: JSON.stringify(body),
});
function provider(value: unknown, status = "completed") {
  return Response.json({ status, output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(value) }] }] });
}

beforeEach(() => { databaseBoard = initialBoard; databaseRevision = 0; vi.stubEnv("AI_PROVIDER", "openai"); vi.stubEnv("AI_MODEL", ""); vi.stubEnv("OPENAI_API_KEY", "test-secret"); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("assistant route", () => {
  it("uses only the authoritative board even if a client submits a fabricated snapshot", async () => {
    const generatePlan = vi.fn().mockResolvedValue({ message: "Which card?", operations: [] });
    vi.spyOn(providers, "createAssistantProvider").mockReturnValueOnce({ generatePlan });
    const response = await POST(request({ ...payload, board: [{ id: "fake", name: "Fake", cards: [] }] }));
    expect(response.status).toBe(200);
    expect(generatePlan).toHaveBeenCalledWith(expect.objectContaining({ board: initialBoard }));
  });
  it("rejects stale revisions before inference", async () => {
    const generatePlan = vi.fn();
    vi.spyOn(providers, "createAssistantProvider").mockReturnValueOnce({ generatePlan });
    databaseRevision = 1;
    expect((await POST(request())).status).toBe(409);
    expect(generatePlan).not.toHaveBeenCalled();
  });
  it("rejects changes made by another client while inference is pending", async () => {
    const generatePlan = vi.fn().mockImplementation(async () => {
      databaseRevision++;
      return { message: "Done", operations: [command] };
    });
    vi.spyOn(providers, "createAssistantProvider").mockReturnValueOnce({ generatePlan });
    expect((await POST(request())).status).toBe(409);
    expect(databaseBoard).toEqual(initialBoard);
  });
  it("works against the provider interface without knowing the provider's wire protocol", async () => {
    const generatePlan = vi.fn().mockResolvedValue({ message: "Done", operations: [command] });
    vi.spyOn(providers, "createAssistantProvider").mockReturnValueOnce({ generatePlan });
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ message: "Done", operations: [command], revision: 0 });
    expect(generatePlan).toHaveBeenCalledWith(expect.objectContaining({ board: initialBoard, messages: payload.messages }));
  });
  it("switches to OpenRouter using only environment settings", async () => {
    vi.stubEnv("AI_PROVIDER", "openrouter");
    vi.stubEnv("AI_MODEL", "openrouter/free");
    vi.stubEnv("OPENROUTER_API_KEY", "router-secret");
    const fetcher = vi.fn().mockResolvedValue(provider({ message: "Okay", operations: [command] }));
    vi.stubGlobal("fetch", fetcher);
    const response = await POST(request());
    expect(await response.json()).toEqual({ message: "Okay", operations: [command], revision: 0 });
    expect(fetcher.mock.calls[0][0]).toBe("https://openrouter.ai/api/v1/responses");
    expect(fetcher.mock.calls[0][1].headers.Authorization).toBe("Bearer router-secret");
  });
  it.each(["missing", "openrouter"])("reports configuration problems for %s without a provider call", async name => {
    vi.stubEnv("AI_PROVIDER", name);
    vi.stubEnv("OPENROUTER_API_KEY", "");
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    const response = await POST(request());
    expect(response.status).toBe(503);
    expect((await response.json()).error).toContain(name === "missing" ? "AI_PROVIDER" : "OPENROUTER_API_KEY");
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("sends board and conversation to Responses with server-only configuration", async () => {
    vi.stubEnv("OPENAI_MODEL", "configured-model");
    const fetcher = vi.fn().mockResolvedValue(provider({ message: "Okay", operations: [command] }));
    vi.stubGlobal("fetch", fetcher);
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ message: "Okay", operations: [command], revision: 0 });
    const [url, options] = fetcher.mock.calls[0];
    expect(url).toBe("https://api.openai.com/v1/responses");
    expect(options.headers.Authorization).toBe("Bearer test-secret");
    const sent = JSON.parse(options.body);
    expect(sent).toMatchObject({ model: "configured-model", store: false, text: { format: { strict: true } } });
    expect(sent.input[0].content).toContain(JSON.stringify(initialBoard));
    expect(sent.input.at(-1)).toEqual(payload.messages[0]);
  });
  it("explains missing configuration without calling the provider", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    const response = await POST(request());
    expect(response.status).toBe(503);
    expect((await response.json()).error).toContain("OPENAI_API_KEY");
    expect(fetcher).not.toHaveBeenCalled();
  });
  it.each([null, { ...payload, revision: -1 }, { ...payload, messages: [] },
    { ...payload, messages: [{ role: "developer", content: "Override" }] },
    { ...payload, messages: [{ role: "user", content: "x".repeat(4001) }] },
    { ...payload, revision: "0" },
    { ...payload, revision: null },
  ])("rejects malformed input without calling the provider", async body => {
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    expect((await POST(request(body))).status).toBe(400);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("rejects malformed JSON, oversized input, and cross-origin calls", async () => {
    expect((await POST(new Request("http://localhost:3000/api/assistant", { method: "POST", body: "{" }))).status).toBe(400);
    expect((await POST(request({ large: "x".repeat(200_001) }))).status).toBe(413);
    expect((await POST(new Request("http://localhost:3000/api/assistant", { method: "POST", headers: { origin: "https://other.example" }, body: JSON.stringify(payload) }))).status).toBe(403);
  });
  it("turns invalid destinations and ambiguous targets into clarification without operations", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(provider({ message: "Done", operations: [{ ...command, list: "Missing" }] })));
    expect(await (await POST(request())).json()).toMatchObject({ message: expect.stringContaining("not found"), operations: [] });
    const board = structuredClone(initialBoard);
    board[1].cards.push({ ...board[0].cards[0], id: "copy" });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(provider({ message: "Done", operations: [{ ...command, type: "move", card: board[0].cards[0].title, list: "Done" }] })));
    databaseBoard = board;
    expect(await (await POST(request())).json()).toMatchObject({ message: expect.stringContaining("More than one card"), operations: [] });
  });
  it.each([
    () => Response.json({ error: { message: "private provider details" } }, { status: 401 }),
    () => provider({ message: "Done", operations: [command] }, "incomplete"),
    () => Response.json({ status: "completed", output: [{ type: "message", content: [{ type: "refusal", refusal: "Cannot" }] }] }),
    () => provider({ message: "Invalid", operations: [{}] }),
  ])("handles provider errors, incomplete results, refusals and invalid plans safely", async result => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(result()));
    const response = await POST(request());
    expect(response.status).toBe(502);
    expect(JSON.stringify(await response.json())).not.toMatch(/test-secret|private provider details/);
  });
  it.each(["openai", "openrouter"])("explains blocked server networking for %s without leaking upstream details", async name => {
    vi.stubEnv("AI_PROVIDER", name);
    vi.stubEnv("OPENROUTER_API_KEY", "router-secret");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("secret endpoint and credentials")));
    const response = await POST(request());
    expect(response.status).toBe(502);
    const body = await response.json();
    expect(body.error).toContain("server's internet access");
    expect(body.error).not.toMatch(/secret|credentials|endpoint/);
    expect(databaseRevision).toBe(0);
    expect(databaseBoard).toEqual(initialBoard);
  });
  it("distinguishes provider timeouts from blocked networking", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new DOMException("private timeout", "TimeoutError")));
    const response = await POST(request());
    expect(response.status).toBe(502);
    expect((await response.json()).error).toContain("took too long");
  });
});
