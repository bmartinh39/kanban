import nextEnv from "@next/env";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { openDatabase } from "../app/server/db/connection.ts";

nextEnv.loadEnvConfig(process.cwd());
const command = process.argv[2];
const db = openDatabase(undefined, command === "migrate");
try {
  if (command === "backup") {
    const destination = process.argv[3];
    if (!destination) throw new Error("Usage: npm run db:backup -- <destination.sqlite>");
    if (resolve(destination) === resolve(process.env.DATABASE_PATH || "./data/kanban.sqlite")) throw new Error("Backup destination must differ from the active database.");
    mkdirSync(dirname(resolve(destination)), { recursive: true });
    await db.backup(destination);
    console.log("Database backup completed.");
  } else if (command !== "migrate") throw new Error("Expected migrate or backup.");
} finally { db.close(); }
