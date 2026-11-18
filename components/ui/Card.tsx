import { cn } from "@/lib/utils";

// Kaart in de Ova-huisstijl: effen kaartvlak met een zachte rand, zonder blur.
// `style` is er voor de gefaseerde entree-animatie (--i op het dashboard).
export function Card({
  className,
  children,
  style,
  id,
}: {
  className?: string;
  children: React.ReactNode;
  style?: React.CSSProperties;
  /** Anker voor bijv. de productrondleiding (#tour-team-today). */
  id?: string;
}) {
  return (
    <div id={id} style={style} className={cn("rounded-2xl border border-rand bg-kaart", className)}>
      {children}
    </div>
  );
}
