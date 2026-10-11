import { ImageResponse } from "next/og";

// Deelafbeelding (1200x630) voor WhatsApp, LinkedIn, X, Slack...
// In Saldova-paars, zonder externe fonts of afbeeldingen.
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Saldova";

export default async function OpengraphImage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const en = locale === "en";
  const tagline = en ? "Invoices, hours and taxes — sorted in minutes." : "Facturen, uren en belasting — in minuten geregeld.";
  const sub = en ? "For freelancers and small businesses" : "Voor zzp'ers en kleine bedrijven";
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 72, background: "linear-gradient(135deg, #0A0618 0%, #1e1147 55%, #4c1d95 100%)", color: "white", fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div style={{ width: 64, height: 64, borderRadius: 18, background: "#7c3aed", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 40, fontWeight: 800 }}>S</div>
          <div style={{ fontSize: 44, fontWeight: 800, letterSpacing: -1 }}>Saldova</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ fontSize: 68, fontWeight: 800, lineHeight: 1.05, letterSpacing: -2, maxWidth: 980 }}>{tagline}</div>
          <div style={{ fontSize: 32, color: "#c4b5fd" }}>{sub}</div>
        </div>
        <div style={{ display: "flex", gap: 16, fontSize: 26, color: "#ddd6fe" }}>
          {(en ? ["Invoices & quotes", "Hours & mileage", "Tax reserve"] : ["Facturen & offertes", "Uren & ritten", "Belastingreservering"]).map((x) => (
            <div key={x} style={{ display: "flex", padding: "10px 22px", borderRadius: 999, border: "2px solid rgba(196,181,253,0.4)" }}>{x}</div>
          ))}
        </div>
      </div>
    ),
    size,
  );
}
