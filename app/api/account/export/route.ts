import { requireUser, errorResponse } from "@/lib/auth-helpers";
import { assertCan } from "@/lib/permissions";
import { logAccount } from "@/lib/audit";
import { buildAccountExport, exportAccessFor, zipEntries, type ExportSource } from "@/lib/account-export";
import { prismaExportSource } from "@/lib/account-export-source";

// Een grote administratie (honderden facturen als PDF, bonnetjes) kost tijd.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// GET /api/account/export — volledige export van het account als ZIP (stream).
// Inhoud: zie lib/account-export.ts en LEESMIJ.txt in de ZIP.
// Bewust GEEN abonnementscontrole: ook na een verlopen proef of opzegging moet
// de eigenaar zijn eigen administratie kunnen ophalen. Deze route leest alleen.
// Rechten: de eigenaar, of een teamlid met het recht 'exports' (boekhouder);
// altijd alleen het eigen account (accountId uit de sessie). Wat een teamlid
// verder ziet (team, verlof, taken, activiteitenlog, uurloon) volgt zijn
// andere rechten: zie exportAccessFor.
export async function GET() {
  try {
    const user = await requireUser();
    assertCan(user, "exports");
    const accountId = user.accountId;
    const actor = { id: user.id, name: user.name, email: user.email };
    const now = new Date();

    // De basisgegevens vóór het antwoord ophalen: is de database onbereikbaar,
    // dan krijgt de gebruiker een nette foutmelding in plaats van een kapotte ZIP.
    const prisma = prismaExportSource(accountId);
    const context = await prisma.context();
    const source: ExportSource = { ...prisma, context: async () => context };

    const parts = zipEntries(buildAccountExport(source, { access: exportAccessFor(user), now }), now)[Symbol.asyncIterator]();

    // Pull-stream: pas het volgende stuk maken als de browser het vorige heeft
    // opgehaald, zodat nooit de hele ZIP in het geheugen staat (en de limiet
    // van ~4,5 MB voor een niet-gestreamd antwoord niet geldt).
    // Het activiteitenlog krijgt pas "geëxporteerd" als de ZIP compleet is.
    const stream = new ReadableStream<Uint8Array>({
      async pull(controller) {
        try {
          const { value, done } = await parts.next();
          if (done) {
            controller.close();
            logAccount(accountId, actor, "account.exported", "volledige export (ZIP)");
          } else {
            controller.enqueue(value);
          }
        } catch (err) {
          console.error("[export] stream_failed", { type: err instanceof Error ? err.name : "UnknownError" });
          logAccount(accountId, actor, "account.export_failed", "volledige export (ZIP) afgebroken door een fout");
          controller.error(err);
        }
      },
      async cancel() {
        await parts.return?.(undefined);
      },
    });

    const day = now.toISOString().slice(0, 10);
    return new Response(stream, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="saldova-export-${day}.zip"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "X-Robots-Tag": "noindex, nofollow, noarchive",
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
