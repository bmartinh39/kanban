import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readBody, HttpError } from "../app/server/board-http";
import { requestByteLimit, requestCharacterLimit } from "../app/limits";
import { openDatabase } from "../app/server/db/connection";
import { boardRepository } from "../app/server/db/repository";
import { getBoardRepository } from "../app/server/db";
import { POST as saveActions } from "../app/api/board/actions/route";
import { POST as askAssistant } from "../app/api/assistant/route";
import * as providers from "../app/server/assistant/providers";

vi.mock("../app/server/db", () => ({ getBoardRepository: vi.fn() }));

const encoder = new TextEncoder();
const origin = "http://localhost";

// A chunked body without Content-Length; records how many chunks the server pulled.
function streamed(chunks: Uint8Array[], headers: Record<string, string> = {}, url = `${origin}/api/board/actions`) {
  let pulled = 0;
  let cancelled = false;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (pulled === chunks.length) return controller.close();
      controller.enqueue(chunks[pulled++]);
    },
    cancel() { cancelled = true; },
  }, { highWaterMark: 0 }); // Pull only when the server reads.
  const request = new Request(url, { method: "POST", headers: { origin, ...headers }, body, duplex: "half" } as RequestInit);
  return { request, pulled: () => pulled, cancelled: () => cancelled };
}

const status = (promise: Promise<unknown>) => promise.then(() => 200, (error: HttpError) => error.status);
// JSON whose UTF-8 encoding is exactly `bytes` long, padded with a string field.
const jsonOfBytes = (bytes: number) => JSON.stringify({ revision: 0, pad: "x".repeat(bytes - '{"revision":0,"pad":""}'.length) });

let db: ReturnType<typeof openDatabase>;
beforeEach(() => { db = openDatabase(":memory:", true); vi.mocked(getBoardRepository).mockReturnValue(boardRepository(db)); });
afterEach(() => { db.close(); vi.restoreAllMocks(); });

describe("request body byte limit (issue #19)", () => {
  it("accepts bodies below and exactly at the character limit and rejects one byte over the byte limit", async () => {
    const atCharacterLimit = jsonOfBytes(requestCharacterLimit);
    expect(await readBody(streamed([encoder.encode(atCharacterLimit)]).request)).toMatchObject({ revision: 0 });
    expect(await status(readBody(streamed([encoder.encode(jsonOfBytes(1_000))]).request))).toBe(200);
    expect(await status(readBody(streamed([new Uint8Array(requestByteLimit + 1)]).request))).toBe(413);
  });

  it("measures bytes, not characters: a maximum-length multibyte request is still accepted", async () => {
    // 3 bytes per character: within the character limit, but nearly three times as many bytes.
    const body = JSON.stringify({ revision: 0, pad: "€".repeat(requestCharacterLimit - 100) });
    expect(encoder.encode(body).length).toBeGreaterThan(requestCharacterLimit * 2);
    expect(await readBody(streamed([encoder.encode(body)]).request)).toMatchObject({ revision: 0 });
  });

  it("stops reading a chunked stream without Content-Length as soon as it exceeds the limit", async () => {
    const chunk = new Uint8Array(100_000).fill(0x20);
    const chunks = Array.from({ length: 50 }, () => chunk);
    const body = streamed(chunks);
    expect(await status(readBody(body.request))).toBe(413);
    expect(body.pulled()).toBeLessThan(10);
    expect(body.cancelled()).toBe(true);
  });

  it("rejects an oversized declared Content-Length before reading, and still enforces the limit when it understates the body", async () => {
    const declared = streamed([encoder.encode("{}")], { "content-length": String(requestByteLimit + 1) });
    expect(await status(readBody(declared.request))).toBe(413);
    expect(declared.pulled()).toBe(0);
    const misleading = streamed(Array.from({ length: 10 }, () => new Uint8Array(100_000).fill(0x20)), { "content-length": "10" });
    expect(await status(readBody(misleading.request))).toBe(413);
  });

  it("decodes multibyte UTF-8 split across chunk boundaries", async () => {
    const bytes = encoder.encode(JSON.stringify({ revision: 0, title: "café €😀" }));
    const chunks = Array.from(bytes, byte => new Uint8Array([byte]));
    expect(await readBody(streamed(chunks).request)).toEqual({ revision: 0, title: "café €😀" });
  });

  it.each([
    ["malformed JSON", [encoder.encode("{")], 400],
    ["invalid UTF-8", [new Uint8Array([0x7b, 0xff, 0x7d])], 400],
    ["non-object JSON", [encoder.encode("[1, 2]")], 400],
  ])("rejects %s", async (_name, chunks, expected) => {
    expect(await status(readBody(streamed(chunks).request))).toBe(expected);
  });

  it("rejects cross-origin requests before reading the body", async () => {
    const body = streamed([encoder.encode("{}")], { origin: "https://other.example" });
    expect(await status(readBody(body.request))).toBe(403);
    expect(body.pulled()).toBe(0);
  });

  it("never mutates the board after a size rejection", async () => {
    const before = boardRepository(db).read();
    const prefix = encoder.encode('{"revision":0,"actions":[{"type":"rename","columnId":"ideas","name":"');
    const response = await saveActions(streamed([prefix, new Uint8Array(requestByteLimit).fill(0x61), encoder.encode('"}]}')]).request);
    expect(response.status).toBe(413);
    expect(boardRepository(db).read()).toEqual(before);
  });

  it("never calls the AI provider after a size rejection", async () => {
    const generatePlan = vi.fn();
    vi.spyOn(providers, "createAssistantProvider").mockReturnValue({ generatePlan });
    const response = await askAssistant(streamed([new Uint8Array(requestByteLimit + 1).fill(0x20)], {}, `${origin}/api/assistant`).request);
    expect(response.status).toBe(413);
    expect(generatePlan).not.toHaveBeenCalled();
  });
});
