"use client";

// Laatste vangnet: verschijnt als zelfs de hoofdlayout faalt. Heeft daarom een eigen
// <html> en <body>, geen next-intl en geen gedeelde CSS; alles staat hier inline.
// Tekst in beide talen, zodat het altijd klopt.
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="nl">
      <body style={{ margin: 0, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "1.5rem", boxSizing: "border-box", background: "#0b0f14", color: "#fff", fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif", textAlign: "center" }}>
        <main style={{ maxWidth: "26rem", width: "100%", padding: "2.25rem 1.75rem", border: "1px solid #1f2937", borderRadius: "1.5rem", background: "#11161d", boxSizing: "border-box" }}>
          <p style={{ margin: 0, fontSize: "0.95rem", letterSpacing: "0.28em", fontWeight: 500, textTransform: "uppercase" }}>
            <span style={{ color: "#a78bfa" }}>SALD</span>OVA
          </p>
          <h1 style={{ margin: "1.25rem 0 0", fontSize: "1.35rem" }}>Er ging iets mis</h1>
          <p style={{ margin: "0.6rem 0 0", fontSize: "0.95rem", lineHeight: 1.55, color: "#cbd5e1" }}>
            Saldova kon deze pagina niet laden. Probeer het opnieuw; je opgeslagen gegevens blijven bewaard.
          </p>
          <p lang="en" style={{ margin: "0.6rem 0 0", fontSize: "0.85rem", lineHeight: 1.55, color: "#94a3b8" }}>
            Something went wrong. Please try again; your saved data is safe.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{ marginTop: "1.6rem", padding: "0.8rem 1.8rem", border: 0, borderRadius: "0.8rem", background: "#fff", color: "#0b0f14", fontSize: "0.95rem", fontWeight: 600, fontFamily: "inherit", cursor: "pointer" }}
          >
            Opnieuw proberen · Try again
          </button>
          {error.digest && <p style={{ margin: "1rem 0 0", fontSize: "0.75rem", color: "#94a3b8" }}>Foutcode / Error code: {error.digest}</p>}
        </main>
      </body>
    </html>
  );
}
