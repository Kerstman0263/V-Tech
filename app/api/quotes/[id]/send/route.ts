import { NextResponse } from "next/server";
import { requireUser, errorResponse } from "@/lib/auth-helpers";
import { assertCan } from "@/lib/permissions";
import { db } from "@/lib/db";
import { sendEmail, emailConfigured } from "@/lib/email";
import { logAccount } from "@/lib/audit";

const appUrl = () => process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// POST /api/quotes/:id/send — markeer als verzonden + mail de publieke link naar de klant.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    assertCan(user, "financials");
    const { id } = await params;

    const quote = await db.quote.findFirst({
      where: { id, userId: user.accountId },
      include: {
        customer: { select: { name: true, email: true } },
        user: { select: { email: true, company: { select: { name: true } } } },
      },
    });
    if (!quote) return NextResponse.json({ error: "Not found" }, { status: 404 });
    // Een al beantwoorde/omgezette offerte niet stilletjes heropenen
    if (quote.status !== "DRAFT" && quote.status !== "SENT") {
      return NextResponse.json({ error: "already_closed", status: quote.status }, { status: 409 });
    }


    const link = `${appUrl()}/quote/${quote.publicToken}`;
    const canEmail = !!quote.customer.email && emailConfigured();
    if (canEmail && quote.customer.email) {
      const company = quote.user.company?.name ?? "Saldova";
      await sendEmail({
        required: true,
        to: quote.customer.email,
        replyTo: quote.user.email,
        fromName: `${company} via Saldova`,
        subject: `Offerte ${quote.quoteNumber} van ${company}`,
        html: `
          <h2 style="color:#111827">Je hebt een offerte ontvangen</h2>
          <p>Beste ${esc(quote.customer.name)},</p>
          <p>${esc(company)} heeft offerte <strong>${esc(quote.quoteNumber)}</strong> voor je klaargezet. Bekijk en reageer via onderstaande link:</p>
          <p style="margin:20px 0"><a href="${link}" style="background:#7c3aed;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600">Bekijk de offerte →</a></p>
          <p style="color:#9ca3af;font-size:12px">${link}</p>
        `,
      });
    }

    await db.quote.updateMany({ where: { id: quote.id, userId: user.accountId, status: "DRAFT" }, data: { status: "SENT" } });
    logAccount(user.accountId, { id: user.id, name: user.name, email: user.email }, "quote.sent", quote.quoteNumber);

    return NextResponse.json({
      ok: true,
      link,
      emailed: canEmail,
      reason: !quote.customer.email ? "no_email" : !emailConfigured() ? "email_not_configured" : null,
    });
  } catch (err) {
    return errorResponse(err);
  }
}
