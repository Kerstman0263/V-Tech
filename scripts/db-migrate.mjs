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

/**
 * Supabase' directe adres (db.<ref>.supabase.co) is alleen IPv6, wat Vercel
 * niet kan bereiken. We gebruiken daarom de pooler uit DATABASE_URL, maar in
 * "session mode" (poort 5432) zodat DDL-scripts goed werken.
 */
function migrationUrl() {
  const raw = process.env.DATABASE_URL;
  if (!raw) throw new Error("DATABASE_URL ontbreekt.");
  const url = new URL(raw);
  if (url.hostname.endsWith("pooler.supabase.com")) {
    url.port = "5432";
    url.searchParams.delete("pgbouncer");
  }
  return url.toString();
}

const dir = path.resolve("prisma/sql");
const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort() : [];
// De URL gaat via een omgevingsvariabele, nooit als argument: zo komt het
// wachtwoord niet in een foutmelding of buildlog terecht.
const env = { ...process.env, DIRECT_URL: migrationUrl() };
for (const file of files) {
  console.log(`[db-migrate] ${file}`);
  try {
    execFileSync(process.execPath, [
      path.resolve("node_modules/prisma/build/index.js"),
      "db", "execute", "--file", path.join(dir, file), "--schema", "prisma/schema.prisma",
    ], { stdio: "inherit", env });
  } catch {
    console.error(`[db-migrate] Mislukt: ${file}. De live-versie is niet aangepast.`);
    process.exit(1);
  }
}
console.log(`[db-migrate] Klaar (${files.length} bestand(en)).`);
