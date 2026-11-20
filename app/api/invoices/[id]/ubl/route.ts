import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { verifyInvoiceAccessToken } from "@/lib/invoice-access";
import { generateUblInvoice, ublPlainAllowed, ublProblems } from "@/lib/ubl";
import { ublBlockedMessage, ublInvoiceData } from "@/lib/ubl-invoice";
import { invoiceParties, liveSource, partiesInclude } from "@/lib/invoice-snapshot";

// GET /api/invoices/:id/ubl — e-factuur (UBL 2.1 / Peppol BIS 3) als XML.
// Zelfde toegang als de PDF: ondernemer met financiële rechten, of de klant
// via de beperkte, ondertekende factuurlink.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const token = new URL(req.url).searchParams.get("token");
  const privateHeaders = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" };
  let accountId: string;
  if (token !== null) {
    const access = verifyInvoiceAccessToken(token, id);
    if (!access) return new Response("Deze factuurlink is ongeldig of verlopen. Vraag de afzender om een nieuwe link.", { status: 403, headers: privateHeaders });
    accountId = access.accountId;
  } else {
    const session = await auth();
    if (!session?.user?.id) return new Response("Unauthorized", { status: 401 });
    if (!can(session.user, "financials")) return new Response("Forbidden", { status: 403 });
    accountId = session.user.accountId;
  }

  const invoice = await db.invoice.findFirst({
    where: { id, userId: accountId },
    include: { ...partiesInclude, lineItems: { orderBy: { position: "asc" } } },
  });
  if (!invoice) return new Response("Not found", { status: 404, headers: privateHeaders });
  // Een concept is nog geen factuur: geen e-factuur die al ingeboekt kan worden.
  if (invoice.status === "DRAFT") return new Response("Verstuur de factuur eerst; een concept kan nog wijzigen.", { status: 409, headers: privateHeaders });

  // Uit de momentopname van het uitreiken; oude facturen zonder: de huidige gegevens.
  const parties = invoiceParties(invoice, liveSource(invoice));
  const data = await ublInvoiceData(
    {
      auditLog: { findFirst: (args) => db.auditLog.findFirst(args) },
      invoice: { findFirst: (args) => db.invoice.findFirst(args) },
    },
    accountId,
    invoice,
    parties,
  );

  // Geen bestand dat een Peppol-validator of boekhoudpakket afkeurt: eerst
  // zeggen wat er ontbreekt (Peppol BIS 3 / NLCIUS).
  const problems = ublProblems(data);
  // ?variant=plain: als de Peppol-versie niet kan door ontbrekende gegevens
  // (bijv. een al uitgereikte factuur waarvan de momentopname geen KvK-nummer
  // of IBAN heeft), dan een gewoon UBL-bestand zonder Peppol-belofte, om zelf
  // in te lezen. Zo blijft wat vóór de Peppol-controle kon, mogelijk.
  const plain = problems.length > 0 && new URL(req.url).searchParams.get("variant") === "plain" && ublPlainAllowed(problems);
  if (problems.length && !plain) {
    return new Response(ublBlockedMessage(problems, parties.locale ?? invoice.user.locale), {
      status: 409,
      headers: { ...privateHeaders, "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  const xml = generateUblInvoice(data, { peppol: !plain });
  const isCredit = Number(invoice.total) < 0;
  const base = plain ? (isCredit ? "creditfactuur-xml" : "factuur-xml") : (isCredit ? "e-creditfactuur" : "e-factuur");

  return new Response(xml, {
    headers: {
      ...privateHeaders,
      "Content-Type": "application/xml; charset=utf-8",
      "Content-Disposition": `attachment; filename="${base}-${invoice.invoiceNumber.replace(/[^a-zA-Z0-9._-]/g, "_")}${plain ? "-zonder-peppol" : ""}.xml"`,
      "X-Robots-Tag": "noindex, nofollow, noarchive",
    },
  });
}
