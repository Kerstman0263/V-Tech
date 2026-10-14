import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

/**
 * Voert de SQL-bestanden in prisma/sql/ uit tijdens de PRODUCTIE-build op
 * Vercel (vercel-build in package.json). Elk bestand moet veilig zijn om
 * vaker te draaien ("IF NOT EXISTS"). Mislukt er iets, dan stopt de build
 * en blijft de huidige live-versie gewoon draaien.
 *
 * Bewust alleen bij VERCEL_ENV=production: preview-builds en lokale builds
 * raken nooit de echte database.
 */
if (process.env.VERCEL_ENV !== "production") {
  console.log("[db-migrate] Geen productie-build: overgeslagen.");
  process.exit(0);
}

const dir = path.resolve("prisma/sql");
const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort() : [];
for (const file of files) {
  console.log(`[db-migrate] ${file}`);
  execFileSync(process.execPath, [
    path.resolve("node_modules/prisma/build/index.js"),
    "db", "execute", "--file", path.join(dir, file), "--schema", "prisma/schema.prisma",
  ], { stdio: "inherit" });
}
console.log(`[db-migrate] Klaar (${files.length} bestand(en)).`);
