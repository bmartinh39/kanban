import { validRevision } from "../../../board-commands";
import { boardError, HttpError, json, readBody } from "../../../server/board-http";
import { getBoardRepository } from "../../../server/db";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await readBody(request);
    if (!validRevision(body.revision)) throw new HttpError(400, "Send a valid board revision.");
    return json(getBoardRepository().mutate(body.revision, body.actions));
  } catch (error) { return boardError(error); }
}
