import { NextResponse } from "next/server";
import { requireUser, errorResponse } from "@/lib/auth-helpers";
import { assertCan } from "@/lib/permissions";
import { db } from "@/lib/db";
import { sendEmail, emailConfigured } from "@/lib/email";
import { logAccount } from "@/lib/audit";
import { DEMO_EMAIL } from "@/lib/demo";
import { escapeHtml, klantButton, renderKlantEmail, senderName } from "@/lib/email-templates";
import { mailDate } from "@/lib/invoice-send";
import { formatMoney } from "@/lib/utils";

const appUrl = () => process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

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
        user: { select: { email: true, name: true, company: { select: { name: true, logo: true } } } },
      },
    });
    if (!quote) return NextResponse.json({ error: "Not found" }, { status: 404 });
    // Een al beantwoorde/omgezette offerte niet stilletjes heropenen
    if (quote.status !== "DRAFT" && quote.status !== "SENT") {
      return NextResponse.json({ error: "already_closed", status: quote.status }, { status: 409 });
    }

    const link = `${appUrl()}/quote/${quote.publicToken}`;
    // Het demo-account mailt nooit echte klanten; de link werkt wel.
    const isDemo = user.email?.toLowerCase() === DEMO_EMAIL.toLowerCase();
    const canEmail = !!quote.customer.email && emailConfigured() && !isDemo;
    if (canEmail && quote.customer.email) {
      const company = senderName({ companyName: quote.user.company?.name, userName: quote.user.name, email: quote.user.email });
      const amount = formatMoney(Number(quote.total), "nl", quote.currency);
      await sendEmail({
        required: true,
        to: quote.customer.email,
        replyTo: quote.user.email,
        fromName: `${company} via Saldova`,
        subject: `Offerte ${quote.quoteNumber} van ${company}`,
        html: renderKlantEmail({
          companyName: company,
          companyLogo: quote.user.company?.logo,
          heading: `Offerte ${quote.quoteNumber}`,
          preheader: `Offerte van ${company} · ${amount}`,
          bodyHtml: `
            <p style="margin:0 0 12px">Beste ${escapeHtml(quote.customer.name)},</p>
            <p style="margin:0 0 12px">${escapeHtml(company)} heeft offerte <strong>${escapeHtml(quote.quoteNumber)}</strong> voor je klaargezet
            (totaal <strong>${escapeHtml(amount)}</strong>${quote.validUntil ? `, geldig tot en met ${escapeHtml(mailDate(quote.validUntil))}` : ""}).
            Via de knop bekijk je de offerte en kun je hem online accepteren of je vragen doorgeven.</p>
            ${klantButton("Offerte bekijken", link)}
            <p style="margin:0;color:#6b7280;font-size:13px">Werkt de knop niet? Kopieer dan deze link: <span style="word-break:break-all">${escapeHtml(link)}</span></p>
            <p style="margin:20px 0 0">Met vriendelijke groet,<br>${escapeHtml(company)}</p>`,
        }),
      });
    }

    await db.quote.updateMany({ where: { id: quote.id, userId: user.accountId, status: "DRAFT" }, data: { status: "SENT" } });
    logAccount(user.accountId, { id: user.id, name: user.name, email: user.email }, "quote.sent", quote.quoteNumber);

    return NextResponse.json({
      ok: true,
      link,
      emailed: canEmail,
      reason: isDemo ? "demo_locked" : !quote.customer.email ? "no_email" : !emailConfigured() ? "email_not_configured" : null,
    });
  } catch (err) {
    return errorResponse(err);
  }
}
