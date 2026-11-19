import { vi } from "vitest";
import { initialBoard } from "../app/board-state";
import { applyCommands, type BoardSnapshot } from "../app/board-commands";

export function controlledBoard(assistant = vi.fn()) {
  let snapshot: BoardSnapshot = { columns: structuredClone(initialBoard), revision: 0 };
  const fetcher = vi.fn(async (url: string, options?: RequestInit) => {
    if (url === "/api/board") return Response.json(snapshot);
    if (url === "/api/board/actions") {
      const body = JSON.parse(options!.body as string);
      if (body.revision !== snapshot.revision) return Response.json({ error: "The board changed. Reload and retry." }, { status: 409 });
      snapshot = { columns: applyCommands(snapshot.columns, body.actions), revision: snapshot.revision + 1 };
      return Response.json(snapshot);
    }
    const result = await assistant(url, options);
    if (!result.ok) return result;
    return Response.json({ ...await result.json(), revision: JSON.parse(options!.body as string).revision });
  });
  vi.stubGlobal("fetch", fetcher);
  return fetcher;
}
