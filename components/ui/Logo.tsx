import { cn } from "@/lib/utils";

// Saldova logo: gradient-badge met een witte "S" in de MERKKLEUR van het paneel.
// De gradient loopt van brand-500 (boven) naar brand-700 (onder) via CSS-variabelen:
// paars op de website/zzp-paneel, blauw in het bedrijfspaneel ([data-panel="bedrijf"]).
// Met `loading` tekent de S zichzelf van boven naar beneden (laad-animatie).
// Geef de grootte mee via className (bijv. "h-8 w-8").
export function Logo({
  className = "h-8 w-8",
  loading = false,
}: {
  className?: string;
  loading?: boolean;
}) {
  return (
    <svg
      viewBox="0 0 64 64"
      className={cn("inline-block", className)}
      role="img"
      aria-label="Saldova"
    >
      <defs>
        <linearGradient id="saldova-badge" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" style={{ stopColor: "rgb(var(--brand-500, 139 92 246))" }} />
          <stop offset="100%" style={{ stopColor: "rgb(var(--brand-700, 109 40 217))" }} />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="60" height="60" rx="16" fill="url(#saldova-badge)" />
      <path
        d="M43 19.5 C37 13.5 22 15 21.5 23 C21 32 43 31 43 41 C43 50 26 52.5 20.5 45.5"
        fill="none"
        stroke="#ffffff"
        strokeWidth="7.5"
        strokeLinecap="round"
        pathLength={100}
        strokeDasharray={loading ? 100 : undefined}
        className={loading ? "animate-s-draw" : undefined}
      />
    </svg>
  );
}
