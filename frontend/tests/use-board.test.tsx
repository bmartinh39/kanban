import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useBoard } from "../app/use-board";
import { initialBoard } from "../app/board-state";

const snapshot = { columns: initialBoard, revision: 0 };
afterEach(() => vi.unstubAllGlobals());

it("offers retry after load failure without showing dummy data", async () => {
  const fetcher = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(Response.json(snapshot));
  vi.stubGlobal("fetch", fetcher);
  const { result } = renderHook(useBoard);
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.snapshot).toBeNull();
  expect(result.current.available).toBe(false);
  expect(result.current.error).toContain("Could not load");
  await act(() => result.current.load());
  expect(result.current.snapshot).toEqual(snapshot);
  expect(result.current.available).toBe(true);
  expect(result.current.error).toBe("");
});

it("reads canonical state after a conflict and never retries the write", async () => {
  const latest = { columns: initialBoard, revision: 1 };
  const fetcher = vi.fn().mockResolvedValueOnce(Response.json(snapshot))
    .mockResolvedValueOnce(Response.json({ error: "The board changed in another tab." }, { status: 409 }))
    .mockResolvedValueOnce(Response.json(latest));
  vi.stubGlobal("fetch", fetcher);
  const { result } = renderHook(useBoard);
  await waitFor(() => expect(result.current.available).toBe(true));
  await act(async () => { await expect(result.current.save([{ type: "delete", cardId: "c1" }])).rejects.toThrow("another tab"); });
  expect(result.current.snapshot).toEqual(latest);
  expect(result.current.error).toContain("another tab");
  expect(fetcher.mock.calls.filter(([url]) => url === "/api/board/actions")).toHaveLength(1);
});

it("blocks further writes if a failed save cannot be read back", async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(Response.json(snapshot)).mockRejectedValue(new Error("Connection lost"));
  vi.stubGlobal("fetch", fetcher);
  const { result } = renderHook(useBoard);
  await waitFor(() => expect(result.current.available).toBe(true));
  await act(async () => { await expect(result.current.save([{ type: "delete", cardId: "c1" }])).rejects.toThrow("Connection lost"); });
  expect(result.current.available).toBe(false);
  await expect(result.current.save([{ type: "delete", cardId: "c1" }])).rejects.toThrow("Reload");
  expect(result.current.snapshot).toEqual(snapshot);
});

it("rejects stale local revisions and serializes pending writes", async () => {
  let finish!: (value: Response) => void;
  const fetcher = vi.fn().mockResolvedValueOnce(Response.json(snapshot)).mockImplementation(() => new Promise<Response>(resolve => { finish = resolve; }));
  vi.stubGlobal("fetch", fetcher);
  const { result } = renderHook(useBoard);
  await waitFor(() => expect(result.current.available).toBe(true));
  await expect(result.current.save([], 99)).rejects.toThrow("board changed");
  await act(() => result.current.save([]));
  let save!: Promise<void>;
  act(() => { save = result.current.save([{ type: "delete", cardId: "c1" }]); });
  expect(result.current.saving).toBe(true);
  await expect(result.current.save([{ type: "delete", cardId: "c2" }])).rejects.toThrow("still saving");
  await act(async () => { finish(Response.json({ ...snapshot, revision: 1 })); await save; });
  expect(result.current.saving).toBe(false);
  expect(result.current.snapshot?.revision).toBe(1);
});
