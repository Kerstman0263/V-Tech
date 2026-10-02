/** Published Dutch rates. Add a new, reviewed year; never infer future rates. */
export const FISCAL_YEARS = [2025, 2026] as const;
export type FiscalYear = (typeof FISCAL_YEARS)[number];

const sources = {
  zvw: "https://www.belastingdienst.nl/wps/wcm/connect/bldcontentnl/belastingdienst/prive/werk_en_inkomen/zorgverzekeringswet/veranderingen-bijdrage-zvw/",
  vpb: "https://www.belastingdienst.nl/wps/wcm/connect/bldcontentnl/belastingdienst/zakelijk/winst/vennootschapsbelasting/tarieven_vennootschapsbelasting",
  kor: "https://www.belastingdienst.nl/wps/wcm/connect/nl/btw/content/kor-voorwaarden",
  inputVat: "https://www.belastingdienst.nl/wps/wcm/connect/bldcontentnl/belastingdienst/zakelijk/btw/btw_aftrekken/welke_btw_is_aftrekbaar/welke_btw_mag_u_aftrekken",
  vatTiming: "https://www.belastingdienst.nl/wps/wcm/connect/bldcontentnl/belastingdienst/zakelijk/btw/btw_aangifte_doen_en_betalen/bereken_het_bedrag/hoe_berekent_u_het_btw_bedrag/factuurstelsel",
} as const;

export const FISCAL_RATES = {
  2025: {
    year: 2025, revision: "2025.1", verifiedOn: "2026-09-16",
    zvw: { rate: 0.0526, maxIncome: 75_864 },
    vpb: { threshold: 200_000, lowRate: 0.19, highRate: 0.258 },
    korThreshold: 20_000, sources,
  },
  2026: {
    year: 2026, revision: "2026.1", verifiedOn: "2026-09-16",
    zvw: { rate: 0.0485, maxIncome: 79_409 },
    vpb: { threshold: 200_000, lowRate: 0.19, highRate: 0.258 },
    korThreshold: 20_000, sources,
  },
} as const;
