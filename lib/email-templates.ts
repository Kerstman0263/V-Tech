/**
 * Gedeelde, merkgerichte HTML-basis voor alle transactionele e-mails.
 *
 * E-mailclients (Outlook, Gmail) zijn geen browsers: geen flexbox/grid, geen
 * externe CSS, beperkte support. Daarom bewust table-layout + inline styles,
 * en een lichte kaart op een grijze achtergrond (beste leesbaarheid + minste
 * kans op spam-markering). Eén centrale plek zodat elke mail hetzelfde oogt.
 */

const BRAND = "#7c3aed";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://saldova.vercel.app";

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Primaire knop (paarse pil). Bulletproof genoeg voor de meeste clients. */
export function emailButton(label: string, url: string): string {
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0">
      <tr>
        <td style="border-radius:10px;background:${BRAND}">
          <a href="${url}" target="_blank"
             style="display:inline-block;padding:12px 24px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:10px">
            ${escapeHtml(label)}
          </a>
        </td>
      </tr>
    </table>`;
}

/** Klein gekleurd statuslabel (voor bijv. goedgekeurd/afgewezen). */
export function emailBadge(label: string, tone: "green" | "red" | "amber" | "brand"): string {
  const c = {
    green: { bg: "#dcfce7", fg: "#166534" },
    red: { bg: "#fee2e2", fg: "#991b1b" },
    amber: { bg: "#fef3c7", fg: "#92400e" },
    brand: { bg: "#ede9fe", fg: "#5b21b6" },
  }[tone];
  return `<span style="display:inline-block;padding:4px 12px;border-radius:9999px;background:${c.bg};color:${c.fg};font-size:13px;font-weight:600">${escapeHtml(label)}</span>`;
}

interface EmailLayoutInput {
  /** Titel bovenaan de kaart. */
  heading: string;
  /** Kant-en-klare HTML voor de body (mag emailButton/emailBadge bevatten). */
  bodyHtml: string;
  /** Voorbeeldtekst in de inbox-preview (niet zichtbaar in de mail zelf). */
  preheader?: string;
}

/**
 * Wikkelt body-HTML in de volledige Saldova-mailhuisstijl.
 * Geef het resultaat door aan sendEmail({ html }).
 */
export function renderEmail({ heading, bodyHtml, preheader }: EmailLayoutInput): string {
  return `<!doctype html>
<html lang="nl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light">
</head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased">
  ${preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(preheader)}</div>` : ""}
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6">
    <tr>
      <td align="center" style="padding:32px 16px">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08)">
          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#1e1145,#0f0a26);padding:24px 32px">
              <span style="font-size:20px;font-weight:700;color:#ffffff">Saldo<span style="color:#a78bfa">va</span></span>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:32px">
              <h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;color:#111827">${escapeHtml(heading)}</h1>
              <div style="font-size:15px;line-height:1.6;color:#374151">
                ${bodyHtml}
              </div>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:20px 32px;border-top:1px solid #f0f0f2">
              <p style="margin:0;font-size:12px;line-height:1.5;color:#9ca3af">
                Deze e-mail is verstuurd door <a href="${APP_URL}" style="color:${BRAND};text-decoration:none">Saldova</a>,
                jouw administratie voor zzp en mkb.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
