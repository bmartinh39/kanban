"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { BoardSnapshot } from "./board-commands";
import type { BoardCommand } from "./board-state";

async function savedBoard(response: Response): Promise<BoardSnapshot> {
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Board storage is unavailable. Reload before trying again.");
  return result;
}

export function useBoard() {
  const [snapshot, setSnapshot] = useState<BoardSnapshot | null>(null);
  const current = useRef(snapshot);
  const pending = useRef(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [available, setAvailable] = useState(false);

  const adopt = useCallback((value: BoardSnapshot) => {
    current.current = value;
    setSnapshot(value);
    setAvailable(true);
  }, []);
  const load = useCallback((signal?: AbortSignal) =>
    fetch("/api/board", { cache: "no-store", signal }).then(savedBoard).then(value => {
      if (!signal?.aborted) { adopt(value); setError(""); }
    }).catch(() => {
      if (!signal?.aborted) setError("Could not load the saved board. Check your connection and retry.");
    }).finally(() => { if (!signal?.aborted) setLoading(false); }), [adopt]);
  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  async function save(actions: BoardCommand[], expectedRevision = current.current?.revision) {
    if (pending.current) throw new Error("A board change is still saving. Wait and try again.");
    if (!available || expectedRevision === undefined) throw new Error("Reload the saved board before making changes.");
    if (current.current?.revision !== expectedRevision) throw new Error("The board changed while I was thinking. Send your request again. No changes were made.");
    if (!actions.length) return;
    pending.current = true;
    setSaving(true);
    setError("");
    try {
      adopt(await savedBoard(await fetch("/api/board/actions", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ revision: expectedRevision, actions }),
      })));
    } catch (error) {
      // A network failure (TypeError) leaves the outcome unknown; HTTP errors carry the server's reason.
      const message = error instanceof Error && !(error instanceof TypeError) ? error.message : "The save could not be confirmed. Reload to check the saved board.";
      setAvailable(false);
      // A connection can fail after a commit. Read back state; never silently replay a write.
      try { adopt(await savedBoard(await fetch("/api/board", { cache: "no-store" }))); } catch { /* Explicit retry stays available. */ }
      setError(message);
      throw new Error(message);
    } finally { pending.current = false; setSaving(false); }
  }
  return { snapshot, current, saving, loading, error, available, load: () => { setLoading(true); setAvailable(false); return load(); }, save };
}
