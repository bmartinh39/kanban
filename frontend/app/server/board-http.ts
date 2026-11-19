import { InvalidCommand } from "../board-commands";
import { BoardConflict } from "./db/repository";

export function json(value: unknown, status = 200) {
  return Response.json(value, { status, headers: { "Cache-Control": "no-store" } });
}

export async function readBody(request: Request): Promise<Record<string, unknown>> {
  const origin = request.headers.get("origin");
  const url = new URL(request.url);
  // Next.js can normalize request.url to its internal hostname/port. Host retains
  // the browser-facing address, including a container's published port.
  const expectedOrigin = new URL(`${url.protocol}//${request.headers.get("host") || url.host}`).origin;
  if (origin && origin !== expectedOrigin) throw new HttpError(403, "This request must come from the board application.");
  if (request.headers.get("sec-fetch-site") === "cross-site") throw new HttpError(403, "This request must come from the board application.");
  const raw = await request.text();
  if (raw.length > 200_000) throw new HttpError(413, "The board or conversation is too large.");
  let body: unknown;
  try { body = JSON.parse(raw); } catch { throw new HttpError(400, "Send valid JSON."); }
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new HttpError(400, "Send a valid request.");
  return body as Record<string, unknown>;
}

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export function boardError(error: unknown) {
  if (error instanceof HttpError) return json({ error: error.message }, error.status);
  if (error instanceof InvalidCommand) return json({ error: error.message }, 400);
  if (error instanceof BoardConflict) return json({ error: error.message }, 409);
  return json({ error: "Board storage is unavailable. Reload to check the latest saved state before trying again." }, 503);
}
