import { ImageResponse } from "next/og";
import { eiSvg } from "@/components/ova-ei";
import { SITE_TAGLINE } from "@/lib/seo";

// Deelafbeelding (1200x630) voor WhatsApp, LinkedIn, X, Slack...
// In de Ova-huisstijl: donkere grond, het Saldova-ei en het woordmerk, zonder
// externe fonts of afbeeldingen. Bewust op een vaste URL met extensie
// (/og.png?lang=en): zo slaat de taal-middleware hem over en volgt er geen
// doorverwijzing, die niet elk sociaal netwerk volgt.
const size = { width: 1200, height: 630 };
const EI = `data:image/svg+xml;base64,${Buffer.from(eiSvg("saldova")).toString("base64")}`;

export function GET(req: Request) {
  const en = new URL(req.url).searchParams.get("lang") === "en";
  const tagline = en ? SITE_TAGLINE.en : SITE_TAGLINE.nl;
  const chips = en ? ["Invoices & quotes", "Hours & mileage", "Tax buffer"] : ["Facturen & offertes", "Uren & ritten", "Belastingbuffer"];
  const status = en ? "In development" : "In ontwikkeling";
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 72,
          backgroundColor: "#0b0f14",
          backgroundImage: "radial-gradient(circle at 85% 15%, rgba(124,58,237,0.22), rgba(11,15,20,0) 55%)",
          color: "white",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={EI} width={58} height={72} alt="" />
            <div style={{ display: "flex", fontSize: 38, fontWeight: 500, letterSpacing: "0.28em" }}>
              <span style={{ color: "#a78bfa" }}>SALD</span>
              <span>OVA</span>
            </div>
          </div>
          <div style={{ display: "flex", fontSize: 22, color: "#94a3b8", padding: "8px 18px", borderRadius: 999, border: "1px solid #1f2937" }}>{status}</div>
        </div>
        <div style={{ display: "flex", fontSize: 66, fontWeight: 700, lineHeight: 1.1, letterSpacing: -1.5, maxWidth: 940 }}>{tagline}</div>
        <div style={{ display: "flex", gap: 16, fontSize: 26, color: "#cbd5e1" }}>
          {chips.map((x) => (
            <div key={x} style={{ display: "flex", padding: "10px 22px", borderRadius: 999, border: "1px solid #1f2937", backgroundColor: "#11161d" }}>
              {x}
            </div>
          ))}
        </div>
      </div>
    ),
    { ...size, headers: { "Cache-Control": "public, max-age=86400, s-maxage=604800" } },
  );
}
