import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  extractSenderAuth,
  extractToken,
  normalizeJson,
  senderAllowed,
  senderAuthVerdict,
  shortText,
  usableAttachments,
  webhookAuthorized,
  type InboundMessage,
} from "@/lib/inbound-mail";
import { logAccount } from "@/lib/audit";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * POST /api/inbound/email — webhook voor de bonnetjes-inbox.
 *
 * De mailprovider (Cloudflare Email Worker, Mailgun/SendGrid Inbound Parse, …)
 * stuurt elke mail aan <token>@<INBOUND_EMAIL_DOMAIN> hierheen.
 *
 * Beveiliging: alleen via de Authorization-header, vergeleken in constante tijd:
 *  - `Authorization: Bearer <INBOUND_WEBHOOK_SECRET>`, of
 *  - Basic-auth met het geheim als wachtwoord (https://inbox:<geheim>@…/api/inbound/email),
 *    voor providers die geen eigen header kunnen zetten.
 * `?secret=` in het adres werkt NIET meer (geheimen in URL's belanden in logs).
 * Een provider die dat nog gebruikt, moet overstappen op de header.
 *
 * Accepteert JSON (meerdere formaten, zie lib/inbound-mail) en multipart/form-data
 * (velden to/from/subject/text + bestandsbijlagen). Stuurt de provider de
 * uitslag van SPF/DKIM/DMARC mee en is die duidelijk gezakt, dan weigeren we de
 * mail: het afzenderadres is dan vrijwel zeker nagemaakt.
 *
 * Antwoordt altijd 200 na een geldige authenticatie — ook bij onbekend token of
 * geweigerde afzender — zodat de provider niet blijft retry'en en er geen
 * informatie lekt over welke adressen bestaan.
 */
export async function POST(req: Request) {
  const secret = process.env.INBOUND_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "INBOUND_WEBHOOK_SECRET niet geconfigureerd" }, { status: 503 });
  if (!webhookAuthorized(req.headers.get("authorization"), secret)) {
    const viaUrl = new URL(req.url).searchParams.has("secret");
    return NextResponse.json(
      { error: viaUrl ? "Het geheim in het adres (?secret=) werkt niet meer. Stuur het mee in de Authorization-header." : "Unauthorized" },
      { status: 401 },
    );
  }

  let msg: InboundMessage | null = null;
  const ctype = req.headers.get("content-type") ?? "";
  try {
    if (ctype.includes("multipart/form-data") || ctype.includes("application/x-www-form-urlencoded")) {
      msg = await fromFormData(await req.formData());
    } else {
      msg = normalizeJson(await req.json());
    }
  } catch {
    return NextResponse.json({ error: "Onleesbare body" }, { status: 400 });
  }
  if (!msg) return NextResponse.json({ error: "Geen bruikbaar bericht" }, { status: 400 });

  const token = extractToken(msg.to);
  if (!token) return NextResponse.json({ ok: true, ignored: "no-token" });

  const owner = await db.user.findUnique({
    where: { inboundToken: token },
    select: { id: true, email: true, name: true, members: { select: { email: true } } },
  });
  if (!owner) return NextResponse.json({ ok: true, ignored: "unknown-token" });

  // Alleen mail van de eigenaar of een teamlid — anders kan iedereen die het
  // adres kent bonnen in andermans administratie duwen.
  const allowed = senderAllowed(msg.from, [owner.email, ...owner.members.map((m) => m.email)]);
  if (!allowed) {
    logAccount(owner.id, { name: "Bonnetjes-inbox" }, "inbox.rejected", `afzender ${msg.from} niet toegestaan`);
    return NextResponse.json({ ok: true, ignored: "sender-not-allowed" });
  }
  // Het afzenderadres is na te maken; SPF/DKIM/DMARC (als de provider die
  // meestuurt) laten zien of de mail echt van dat domein kwam.
  if (senderAuthVerdict(msg.auth) === "fail") {
    logAccount(owner.id, { name: "Bonnetjes-inbox" }, "inbox.rejected", `afzender ${msg.from} niet echt (SPF/DKIM gezakt)`);
    return NextResponse.json({ ok: true, ignored: "sender-auth-failed" });
  }

  const files = usableAttachments(msg.attachments);
  if (files.length === 0) {
    logAccount(owner.id, { name: "Bonnetjes-inbox" }, "inbox.empty", `mail van ${msg.from} zonder bruikbare bijlage`);
    return NextResponse.json({ ok: true, stored: 0 });
  }

  const subject = shortText(msg.subject, 200);
  const body = shortText(msg.text, 1000);
  await db.inboxItem.createMany({
    data: files.map((f) => ({
      userId: owner.id,
      fromEmail: msg!.from.slice(0, 200),
      subject,
      body,
      fileName: f.fileName.slice(0, 200),
      mimeType: f.mimeType.toLowerCase().split(";")[0],
      size: f.size,
      data: `data:${f.mimeType.toLowerCase().split(";")[0]};base64,${f.base64}`,
    })),
  });
  logAccount(owner.id, { name: "Bonnetjes-inbox" }, "inbox.received", `${files.length} bijlage${files.length === 1 ? "" : "n"} van ${msg.from}`);
  return NextResponse.json({ ok: true, stored: files.length });
}

/** Multipart (Mailgun/SendGrid/Cloudflare-worker-stijl) -> InboundMessage. */
async function fromFormData(fd: FormData): Promise<InboundMessage | null> {
  const str = (k: string) => {
    const v = fd.get(k);
    return typeof v === "string" ? v : "";
  };
  const to = (str("to") || str("recipient") || str("To")).split(",").map((s) => s.trim()).filter(Boolean);
  const from = str("from") || str("sender") || str("From");
  const subject = str("subject") || str("Subject");
  const text = str("text") || str("stripped-text") || str("body-plain") || str("TextBody");
  const attachments: InboundMessage["attachments"] = [];
  for (const [, v] of fd.entries()) {
    if (typeof v === "string") continue;
    const file = v as File;
    if (!file.size) continue;
    const buf = Buffer.from(await file.arrayBuffer());
    attachments.push({ fileName: file.name || "bijlage", mimeType: file.type || "application/octet-stream", base64: buf.toString("base64"), size: buf.length });
  }
  if (to.length === 0 && !from) return null;
  const auth = extractSenderAuth(str, str("headers") || str("message-headers") || undefined);
  return { to, from, subject, text, attachments, ...(Object.keys(auth).length ? { auth } : {}) };
}
