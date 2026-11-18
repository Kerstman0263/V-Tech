import { cn } from "@/lib/utils";
import { OvaEi, Woordmerk } from "@/components/ova-ei";

/**
 * Laadscherm in de Ova-huisstijl: het Saldova-ei dat rustig pulseert, het
 * woordmerk eronder en een dunne laadbalk in violet. Bij "minder beweging"
 * staat alles stil (zie globals.css).
 */
export function BrandLoader({ fullScreen = false }: { fullScreen?: boolean }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "flex w-full flex-col items-center justify-center gap-5 bg-grond",
        fullScreen ? "min-h-screen" : "min-h-[60vh]",
      )}
    >
      <OvaEi merk="saldova" className="h-14 w-auto animate-pulse" />
      <Woordmerk naam="Saldova" kleur="text-saldova-licht" className="text-sm text-white" />
      <div aria-hidden className="h-0.5 w-32 overflow-hidden rounded-full bg-white/5">
        <div className="h-full w-1/3 rounded-full bg-saldova animate-loading-bar" />
      </div>
      <span className="sr-only">Laden… / Loading…</span>
    </div>
  );
}
