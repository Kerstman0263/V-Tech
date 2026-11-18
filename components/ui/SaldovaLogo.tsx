import { Link } from "@/i18n/routing";
import { cn } from "@/lib/utils";
import { OvaEi, Woordmerk } from "@/components/ova-ei";

/**
 * Het Saldova-merk binnen Ova: het ei met het woordmerk SALDOVA ernaast
 * (SALD in violet-licht, OVA in de tekstkleur).
 *
 * - `href`: maakt er een link van (met zichtbare focusring).
 * - `alleenEi`: toont alleen het ei, bijvoorbeeld in een smalle balk.
 * - `eiClassName` / `className`: maat van het ei en extra klassen op de buitenkant.
 */
export function SaldovaLogo({
  href,
  alleenEi = false,
  className,
  eiClassName = "h-7 w-auto",
  woordClassName = "text-[15px] text-white",
  label = "Saldova",
  kleur = "text-saldova-licht",
  onClick,
}: {
  href?: string;
  alleenEi?: boolean;
  className?: string;
  eiClassName?: string;
  woordClassName?: string;
  /** Toegankelijke naam als het een link is (bijv. "Saldova, naar de homepage"). */
  label?: string;
  /** Kleur van "SALD". Op een lichte achtergrond: "text-saldova". */
  kleur?: string;
  onClick?: () => void;
}) {
  const inhoud = (
    <>
      <OvaEi merk="saldova" className={cn("shrink-0", eiClassName)} titel={alleenEi && !href ? "Saldova" : undefined} />
      {!alleenEi && <Woordmerk naam="Saldova" kleur={kleur} className={woordClassName} />}
    </>
  );

  if (href) {
    return (
      <Link
        href={href}
        aria-label={label}
        onClick={onClick}
        className={cn(
          "inline-flex items-center gap-2.5 rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-saldova-licht",
          className,
        )}
      >
        {inhoud}
      </Link>
    );
  }
  return <span className={cn("inline-flex items-center gap-2.5", className)}>{inhoud}</span>;
}
