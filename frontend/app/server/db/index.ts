import "server-only";
import { openDatabase } from "./connection";
import { boardRepository } from "./repository";

const globalDb = globalThis as typeof globalThis & { kanbanRepository?: ReturnType<typeof boardRepository> };
export function getBoardRepository() {
  return globalDb.kanbanRepository ??= boardRepository(openDatabase());
}
