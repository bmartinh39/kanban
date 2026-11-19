import "server-only";
import { openDatabase } from "./connection";
import { boardRepository } from "./repository";

const globalDb = globalThis as typeof globalThis & { kanbanDatabase?: ReturnType<typeof openDatabase> };
export function getBoardRepository() {
  // Keep the connection across hot reloads, but use the current command handlers.
  return boardRepository(globalDb.kanbanDatabase ??= openDatabase());
}
