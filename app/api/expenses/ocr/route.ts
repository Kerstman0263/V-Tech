import { NextResponse } from "next/server";
import { requireUser, errorResponse } from "@/lib/auth-helpers";
import { assertCan } from "@/lib/permissions";
import { rateLimit } from "@/lib/rate-limit";
import { parseReceipt } from "@/lib/ocr/parse-receipt";

/**
 * Bonnetjes-herkenning via een clouddienst (optioneel).
 *
 * GET  -> { provider: "mindee" | "none" }  — de client kiest dan cloud of
 *         lokale herkenning in de browser (Tesseract, zonder sleutel).
 * POST { image: dataUrl } -> { vendor, total, date, vatRate, vatAmount }
 *
 * Alleen actief met OCR_PROVIDER=mindee + MINDEE_API_KEY. Zonder sleutel
 * blijft alles lokaal in de browser: geen kosten, geen data naar derden.
 */
function provider(): "mindee" | "none" {
  return process.env.OCR_PROVIDER === "mindee" && process.env.MINDEE_API_KEY ? "mindee" : "none";
}

export async function GET() {
  try {
    await requireUser();
    return NextResponse.json({ provider: provider() });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    assertCan(user, "financials");
    if (provider() === "none") return NextResponse.json({ error: "no_provider" }, { status: 501 });
    rateLimit(`ocr:${user.accountId}`, 60, 60 * 60 * 1000);

    const body = await req.json().catch(() => ({}));
    const image = typeof body?.image === "string" ? body.image : "";
    if (!image.startsWith("data:image/") || image.length > 2_500_000) {
      return NextResponse.json({ error: "invalid_image" }, { status: 400 });
    }

    // Mindee Expense Receipts v5 — multipart met het bestand
    const [meta, b64] = image.split(",", 2);
    const mime = meta.slice(5, meta.indexOf(";")) || "image/jpeg";
    const bytes = Buffer.from(b64, "base64");
    const form = new FormData();
    form.append("document", new Blob([bytes], { type: mime }), "bon." + (mime.split("/")[1] ?? "jpg"));

    const res = await fetch("https://api.mindee.net/v1/products/mindee/expense_receipts/v5/predict", {
      method: "POST",
      headers: { Authorization: `Token ${process.env.MINDEE_API_KEY}` },
      body: form,
    });
    if (!res.ok) {
      console.error("Mindee OCR mislukt", res.status, await res.text().catch(() => ""));
      return NextResponse.json({ error: "provider_error" }, { status: 502 });
    }
    const data = (await res.json()) as {
      document?: {
        inference?: {
          prediction?: {
            supplier_name?: { value?: string | null };
            total_amount?: { value?: number | null };
            date?: { value?: string | null };
            taxes?: { value?: number | null; rate?: number | null }[];
            ocr?: unknown;
          };
        };
      };
    };
    const p = data.document?.inference?.prediction ?? {};
    const tax = p.taxes?.[0];
    const rate = tax?.rate != null && [0, 9, 21].includes(Math.round(tax.rate)) ? (Math.round(tax.rate) as 0 | 9 | 21) : null;
    const total = p.total_amount?.value ?? null;

    // Ontbrekende velden alsnog uit onze eigen heuristiek proberen (tekst, als aanwezig)
    const fallback = typeof p.ocr === "string" ? parseReceipt(p.ocr) : null;

    return NextResponse.json({
      vendor: p.supplier_name?.value ?? fallback?.vendor ?? null,
      total: total ?? fallback?.total ?? null,
      date: p.date?.value ?? fallback?.date ?? null,
      vatRate: rate ?? fallback?.vatRate ?? null,
      vatAmount: tax?.value ?? fallback?.vatAmount ?? null,
      confidence: total != null ? 0.9 : 0.5,
      provider: "mindee",
    });
  } catch (err) {
    return errorResponse(err);
  }
}
