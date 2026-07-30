import { defineConfig } from "drizzle-kit";

const turso = process.env.TURSO_DATABASE_URL;

export default defineConfig({
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  ...(turso
    ? {
        dialect: "turso",
        dbCredentials: { url: turso, authToken: process.env.TURSO_AUTH_TOKEN },
      }
    : {
        dialect: "sqlite",
        dbCredentials: { url: "file:./data/maoadao.db" },
      }),
});
