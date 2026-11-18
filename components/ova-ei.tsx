import type { SVGProps } from "react";

/**
 * De ei-logo's van de Ova-familie. Elk bedrijf heeft hetzelfde ei in een eigen kleur en
 * met een eigen snede:
 *
 * - Ova Groep: crème (op licht: zwart), één rechte snede.
 * - Saldova: violet, één schuine snede.
 * - Wardova: jade-teal, een kleiner ei met een ring eromheen.
 * - Cloudova: honing, twee rechte sneden.
 *
 * De sneden zijn uitgespaard met een masker, zodat de achtergrond erdoorheen valt; het
 * logo werkt zo op elke achtergrond. `eiSvg()` geeft hetzelfde als losse SVG-tekst, voor
 * het tabbladicoon en de deelafbeelding.
 */

export type OvaMerk = "ova" | "saldova" | "wardova" | "cloudova";

const EI = "M50 2C77 2 98 42 98 76C98 106 77 122 50 122C23 122 2 106 2 76C2 42 23 2 50 2Z";
const BINNENEI = "M50 36C64 36 75 57 75 75C75 92 64 102 50 102C36 102 25 92 25 75C25 57 36 36 50 36Z";

/** Kleuren van boven naar onder. Ova Groep heeft een vaste kleur, afhankelijk van de achtergrond. */
const VERLOOP: Record<Exclude<OvaMerk, "ova">, [string, string]> = {
  saldova: ["#b49cff", "#6d28d9"],
  wardova: ["#52e3c6", "#00a88f"],
  cloudova: ["#f3cb6b", "#9c5e06"],
};

/** Wat er uit het ei wordt gesneden, als SVG-elementen in het masker (zwart = weg). */
const SNEDE: Record<OvaMerk, string> = {
  ova: '<rect x="-5" y="70" width="110" height="7" fill="black"/>',
  saldova: '<polygon points="-5,90 105,49 105,56 -5,97" fill="black"/>',
  wardova: `<path d="${BINNENEI}" fill="none" stroke="black" stroke-width="7"/>`,
  cloudova:
    '<rect x="-5" y="45" width="110" height="7" fill="black"/><rect x="-5" y="76" width="110" height="7" fill="black"/>',
};

function binnenkant(merk: OvaMerk, id: string, licht: boolean): string {
  const vulling = merk === "ova" ? (licht ? "#0b0b0b" : "#ece6df") : `url(#${id}-v)`;
  const verloop =
    merk === "ova"
      ? ""
      : `<linearGradient id="${id}-v" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${VERLOOP[merk][0]}"/><stop offset="1" stop-color="${VERLOOP[merk][1]}"/></linearGradient>`;
  return (
    `<defs>${verloop}<mask id="${id}-m" maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="124">` +
    `<rect width="100" height="124" fill="white"/>${SNEDE[merk]}</mask></defs>` +
    `<path d="${EI}" fill="${vulling}" mask="url(#${id}-m)"/>`
  );
}

/** Het ei als losse SVG-tekst (voor icon.svg en de deelafbeelding). */
export function eiSvg(merk: OvaMerk, licht = false): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 124">${binnenkant(merk, `ei-${merk}`, licht)}</svg>`;
}

/**
 * Het ei als SVG in de pagina. Geef de maat met className (bijvoorbeeld "h-8 w-auto").
 * `licht` is voor een lichte achtergrond: alleen het Ova-ei wordt dan zwart.
 */
export function OvaEi({
  merk,
  licht = false,
  titel,
  ...rest
}: { merk: OvaMerk; licht?: boolean; titel?: string } & Omit<SVGProps<SVGSVGElement>, "viewBox">) {
  /* Elke variant heeft vaste id's. Staat hetzelfde ei twee keer op een pagina, dan zijn
     de definities gelijk, dus het maakt niet uit welke de browser gebruikt. */
  const id = `ova-ei-${merk}${licht ? "-licht" : ""}`;
  return (
    <svg
      viewBox="0 0 100 124"
      role={titel ? "img" : undefined}
      aria-label={titel}
      aria-hidden={titel ? undefined : true}
      {...rest}
      dangerouslySetInnerHTML={{ __html: binnenkant(merk, id, licht) }}
    />
  );
}

/**
 * De naam als woordmerk: het eigen deel ("CLOUD", "WARD") in de merkkleur, "OVA" in de
 * tekstkleur, in hoofdletters en ruim gespatieerd. `kleur` is een Tailwind-klasse,
 * bijvoorbeeld "text-wardova".
 */
export function Woordmerk({ naam, kleur, className }: { naam: string; kleur: string; className?: string }) {
  const eigen = naam.toLowerCase().endsWith("ova") ? naam.slice(0, -3) : naam;
  const rest = naam.slice(eigen.length);
  return (
    <span className={`font-sans font-medium tracking-[0.28em] uppercase ${className ?? ""}`}>
      <span className={kleur}>{eigen}</span>
      {rest}
    </span>
  );
}
