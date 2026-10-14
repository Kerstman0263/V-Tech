import type { Plan } from "@prisma/client";

/**
 * Drie losse producten in één app, elk met een eigen kleur, menu en dashboard:
 *  - zzp:     solo-ondernemer (paars)   — geld verdienen + belasting op orde
 *  - webshop: zzp met Webshop-pakket (mint) — bestellingen, kanalen, btw/OSS
 *  - bedrijf: mkb met personeel (blauw) — team eerst, financiën compact
 */
export type Panel = "zzp" | "webshop" | "bedrijf";

export function panelFor(accountType: "ZZP" | "BEDRIJF", plan: Plan): Panel {
  if (accountType === "BEDRIJF") return "bedrijf";
  return plan === "WEBSHOP" ? "webshop" : "zzp";
}
