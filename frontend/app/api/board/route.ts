import { getBoardRepository } from "../../server/db";
import { boardError, json } from "../../server/board-http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  try { return json(getBoardRepository().read()); }
  catch (error) { return boardError(error); }
}
