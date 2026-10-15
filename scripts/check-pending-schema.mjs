// Controleert een migratie in prisma/sql-pending/ voordat hij live gaat:
//  1. bouwt een lege, geïsoleerde PGlite-database met het HUIDIGE schema;
//  2. voert de pending SQL twee keer uit (moet idempotent zijn);
//  3. vergelijkt de database met schema.prisma + de pending modellen —
//     elk verschil betekent dat SQL en Prisma niet overeenkomen.
// Raakt nooit DATABASE_URL of productie.
//
// Gebruik: node scripts/check-pending-schema.mjs 2026-10-15-ecommerce-engine
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const name = process.argv[2];
if (!name) throw new Error("Geef de naam van de pending migratie mee.");
const sqlFile = path.resolve(`prisma/sql-pending/${name}.sql`);
const modelFile = path.resolve(`prisma/sql-pending/${name}.prisma`);
const URL = "postgresql://postgres:postgres@127.0.0.1:55433/postgres?connection_limit=1&sslmode=disable&pgbouncer=true&statement_cache_size=0";
const prisma = (args) =>
  promisify(execFile)(process.execPath, [path.resolve("node_modules/prisma/build/index.js"), ...args], {
    env: { ...process.env, DATABASE_URL: URL, DIRECT_URL: URL },
    maxBuffer: 10_000_000,
  });

// Gecombineerd schema: bestaande modellen + toegevoegde velden + nieuwe modellen.
function combinedSchema() {
  let schema = fs.readFileSync("prisma/schema.prisma", "utf8");
  const pending = fs.readFileSync(modelFile, "utf8");
  const additions = [...pending.matchAll(/^\/\/ model (\w+) \{\n([\s\S]*?)^\/\/ \}/gm)];
  for (const [, model, body] of additions) {
    const fields = body.split("\n").map((l) => l.replace(/^\/\/ ?/, "")).filter((l) => l.trim()).join("\n");
    const start = schema.search(new RegExp(`^model ${model} \\{`, "m"));
    if (start < 0) throw new Error(`Model ${model} niet gevonden in schema.prisma`);
    const end = schema.indexOf("\n}", start);
    schema = `${schema.slice(0, end)}\n${fields}${schema.slice(end)}`;
  }
  return `${schema}\n${pending}`;
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "saldova-schema-"));
const target = path.join(tmp, "schema.prisma");
fs.writeFileSync(target, combinedSchema());

const { stdout: base } = await prisma(["migrate", "diff", "--from-empty", "--to-schema-datamodel", "prisma/schema.prisma", "--script"]);
const db = await PGlite.create();
await db.exec(base);
const sql = fs.readFileSync(sqlFile, "utf8");
await db.exec(sql);
await db.exec(sql); // tweede keer: mag niets veranderen of falen
const server = new PGLiteSocketServer({ db, host: "127.0.0.1", port: 55433, maxConnections: 4 });
await server.start();

let failed = false;
try {
  await prisma(["validate", "--schema", target]);
  const { stdout } = await prisma(["migrate", "diff", "--from-url", URL, "--to-schema-datamodel", target, "--script"]);
  const remaining = stdout.split("\n").filter((l) => l.trim() && !l.startsWith("--")).join("\n");
  if (remaining) {
    failed = true;
    console.error("✗ SQL en Prisma-modellen verschillen:\n" + remaining);
  } else {
    console.log("✓ SQL draait twee keer foutloos en komt exact overeen met de Prisma-modellen.");
  }
} finally {
  await server.stop();
  await db.close();
  fs.rmSync(tmp, { recursive: true, force: true });
}
process.exit(failed ? 1 : 0);
