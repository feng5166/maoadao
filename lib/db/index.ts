import fs from "node:fs";
import path from "node:path";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import "../env";
import * as schema from "./schema";

// 本地开发用 file: SQLite，线上用 Turso（同一套 libSQL 协议与代码）
const url = process.env.TURSO_DATABASE_URL ?? "file:./data/maoadao.db";
if (url.startsWith("file:")) {
  fs.mkdirSync(path.dirname(url.slice("file:".length)), { recursive: true });
}

const client = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN });

export const db = drizzle(client, { schema });
export { schema };
