import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";

export const TEST_DATABASE_URL = "postgresql://postgres:postgres@127.0.0.1:55432/postgres?connection_limit=1&sslmode=disable&pgbouncer=true&statement_cache_size=0";

/** Always an isolated in-memory database bound to loopback, never DATABASE_URL. */
export async function startTestDatabase() {
  const { stdout } = await promisify(execFile)(process.execPath, [
    path.resolve("node_modules/prisma/build/index.js"), "migrate", "diff",
    "--from-empty", "--to-schema-datamodel", "prisma/schema.prisma", "--script",
  ], { env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL, DIRECT_URL: TEST_DATABASE_URL }, maxBuffer: 5_000_000 });
  const database = await PGlite.create();
  await database.exec(stdout);
  const server = new PGLiteSocketServer({ db: database, host: "127.0.0.1", port: 55432, maxConnections: 4 });
  await server.start();
  return {
    url: TEST_DATABASE_URL,
    async stop() { await server.stop(); await database.close(); },
  };
}
