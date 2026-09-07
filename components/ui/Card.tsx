import { cn } from "@/lib/utils";

// Eenvoudige kaart-container met subtiele schaduw.
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
    <div
      id={id}
      style={style}
      className={cn(
        "rounded-2xl border border-white/[0.05] bg-[#12112a]/60 backdrop-blur-md",
        className,
      )}
    >
      {children}
    </div>
  );
}
