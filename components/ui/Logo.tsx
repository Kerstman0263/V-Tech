import { cn } from "@/lib/utils";
import { OvaEi } from "@/components/ova-ei";

// Saldova-logo: het Ova-ei van Saldova (violet verloop met één schuine snede).
// Vaste kleur, hangt niet aan --brand: in elk paneel blijft het merk herkenbaar.
// Geef de grootte mee via className (bijv. "h-8 w-8"); het ei houdt zijn eigen
// verhouding en wordt in een vierkant vak gecentreerd.
export function Logo({
  className = "h-8 w-8",
}: {
  className?: string;
  /** Verouderd: het ei heeft geen tekenanimatie meer. Wordt genegeerd. */
  loading?: boolean;
}) {
  return <OvaEi merk="saldova" titel="Saldova" className={cn("inline-block shrink-0", className)} />;
}
