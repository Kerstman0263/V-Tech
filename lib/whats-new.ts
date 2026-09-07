/**
 * "Wat is er nieuw" — elke nieuwe functie in het paneel wordt hier vermeld.
 * Nieuwste bovenaan. `navKey` koppelt een item aan een menu-item, dat dan
 * 30 dagen een "Nieuw"-label krijgt. Tweetalige data (inhoud, geen UI-tekst).
 *
 * Bij een nieuwe functie: één entry toevoegen — de sparkle in de header,
 * het menu-label en het overzicht volgen automatisch.
 */
export interface WhatsNewEntry {
  id: string; // uniek, bijv. "2026-08-23-reports"
  date: string; // YYYY-MM-DD
  navKey?: string; // sidebar-key voor het "Nieuw"-label
  href?: string; // waar je het vindt
  title: { nl: string; en: string };
  body: { nl: string; en: string };
}

export const NEW_BADGE_DAYS = 30;

export const WHATS_NEW: WhatsNewEntry[] = [
  {
    id: "2026-08-27-mkb-batch",
    date: "2026-08-27",
    navKey: "team",
    href: "/team",
    title: { nl: "Rechten per medewerker, marge & e-handtekening", en: "Rights per employee, margin & e-signature" },
    body: {
      nl: "Vier vinkjes per medewerker (facturatie, uren goedkeuren, team, exports), bruto uurloon met marge per medewerker en project, offertes digitaal ondertekenen met automatische aanbetalingsfactuur, Auditfile (XAF) + journaalposten voor je boekhouder, en zelf overstappen van zzp naar bedrijf.",
      en: "Four checkboxes per employee (invoicing, approve hours, team, exports), gross hourly wage with margin per employee and project, digitally signed quotes with automatic deposit invoice, Audit file (XAF) + journal entries for your accountant, and self-service switch from freelancer to company.",
    },
  },
  {
    id: "2026-08-27-inbox",
    date: "2026-08-27",
    navKey: "expenses",
    href: "/settings",
    title: { nl: "Bonnetjes per e-mail (inbox)", en: "Receipts by email (inbox)" },
    body: {
      nl: "Je hebt nu een eigen, geheim e-mailadres voor bonnen (Instellingen). Mail of forward een bon vanaf je telefoon en hij staat in Uitgaven → Bonnetjes-inbox, klaar om met de scanner te verwerken. Ontvangen gaat live zodra ons maildomein actief is.",
      en: "You now have your own secret email address for receipts (Settings). Email or forward a receipt from your phone and it lands in Expenses → Receipt inbox, ready to process with the scanner. Receiving goes live as soon as our mail domain is active.",
    },
  },
  {
    id: "2026-08-27-time-approval",
    date: "2026-08-27",
    navKey: "time",
    href: "/time",
    title: { nl: "Uren goedkeuren (bedrijven)", en: "Hours approval (companies)" },
    body: {
      nl: "Uren van medewerkers komen eerst ter beoordeling bij de eigenaar of leidinggevende. Goedkeuren per stuk of alles tegelijk, afkeuren met reden — alleen goedgekeurde uren zijn factureerbaar. De medewerker krijgt een mail.",
      en: "Employee hours are first reviewed by the owner or manager. Approve one by one or all at once, reject with a reason — only approved hours can be invoiced. The employee gets an email.",
    },
  },
  {
    id: "2026-08-27-panels",
    date: "2026-08-27",
    href: "/dashboard",
    title: { nl: "Eigen paneel voor bedrijven + proefperiode", en: "Dedicated company panel + trial" },
    body: {
      nl: "Bedrijven krijgen een eigen (teal) paneel met team-overzicht, wie-doet-wat en verlofplanning. Nieuwe bedrijven starten 30 dagen gratis op Business. Rechtsvorm (eenmanszaak/vof/bv) bepaalt nu de belastingberekening in Fiscale Rust.",
      en: "Companies get their own (teal) panel with team overview, who-does-what and leave planning. New companies start with a 30-day Business trial. Legal form (sole trader/partnership/bv) now drives the tax calculation in Fiscale Rust.",
    },
  },
  {
    id: "2026-08-23-reports",
    date: "2026-08-23",
    navKey: "reports",
    href: "/reports",
    title: { nl: "Rapportages", en: "Reports" },
    body: {
      nl: "Winst & verlies per jaar, omzet per klant, kosten per categorie, maandverloop en welke facturen te lang openstaan.",
      en: "Profit & loss per year, revenue per customer, costs per category, monthly trend and which invoices are overdue too long.",
    },
  },
  {
    id: "2026-08-23-assets",
    date: "2026-08-23",
    navKey: "assets",
    href: "/assets",
    title: { nl: "Bezittingen & afschrijvingen", en: "Assets & depreciation" },
    body: {
      nl: "Laptop, auto of gereedschap één keer invoeren — Saldova schrijft maandelijks af en telt het mee als kosten.",
      en: "Enter your laptop, car or tools once — Saldova depreciates monthly and counts it as costs.",
    },
  },
  {
    id: "2026-08-23-accountant",
    date: "2026-08-23",
    href: "/settings",
    title: { nl: "Boekhouder-toegang", en: "Accountant access" },
    body: {
      nl: "Geef je boekhouder toegang tot je administratie (Instellingen). Ziet alle financiën, geen personeel of instellingen.",
      en: "Give your accountant access to your administration (Settings). Sees all finances, no staff or settings.",
    },
  },
  {
    id: "2026-08-23-pwa",
    date: "2026-08-23",
    href: "/desktop",
    title: { nl: "Saldova als telefoon-app", en: "Saldova as a phone app" },
    body: {
      nl: "Zet Saldova op je beginscherm (iPhone: Delen → Zet op beginscherm). Eigen icoon, volledig scherm, offline-scherm.",
      en: "Add Saldova to your home screen (iPhone: Share → Add to Home Screen). Own icon, full screen, offline screen.",
    },
  },
  {
    id: "2026-08-23-ocr",
    date: "2026-08-23",
    navKey: "expenses",
    href: "/expenses",
    title: { nl: "Bonnetjes scannen", en: "Scan receipts" },
    body: {
      nl: "Foto van je bon → bedrag, datum, btw en leverancier worden automatisch ingevuld. Herkenning in je browser, zonder dat de foto je apparaat verlaat.",
      en: "Photo of your receipt → amount, date, VAT and vendor are filled in automatically. Recognition in your browser, without the photo leaving your device.",
    },
  },
  {
    id: "2026-08-23-recurring",
    date: "2026-08-23",
    navKey: "recurring",
    href: "/recurring",
    title: { nl: "Periodieke facturen", en: "Recurring invoices" },
    body: {
      nl: "Abonnementen en vaste maandfacturen worden automatisch aangemaakt — en desgewenst direct gemaild.",
      en: "Subscriptions and fixed monthly invoices are created automatically — and emailed straight away if you like.",
    },
  },
  {
    id: "2026-08-23-products",
    date: "2026-08-23",
    navKey: "products",
    href: "/products",
    title: { nl: "Productencatalogus", en: "Product catalogue" },
    body: {
      nl: "Vaste producten en diensten met prijs en btw — kies ze met één klik op facturen, offertes en snelle offertes.",
      en: "Fixed products and services with price and VAT — pick them with one click on invoices, quotes and quick quotes.",
    },
  },
  {
    id: "2026-08-23-2fa",
    date: "2026-08-23",
    href: "/settings",
    title: { nl: "Tweestapsverificatie", en: "Two-step verification" },
    body: {
      nl: "Extra slot op je account met een authenticator-app en back-upcodes (Instellingen → Tweestapsverificatie).",
      en: "Extra lock on your account with an authenticator app and backup codes (Settings → Two-step verification).",
    },
  },
  {
    id: "2026-08-23-quick-quote",
    date: "2026-08-23",
    navKey: "snelleOfferte",
    href: "/snelle-offerte",
    title: { nl: "Snelle Offerte vernieuwd", en: "Quick Quote refreshed" },
    body: {
      nl: "Btw-keuze, geldigheidsduur, bericht aan je klant, delen via WhatsApp en een premium klantpagina met verloopdatum.",
      en: "VAT choice, validity period, message to your client, sharing via WhatsApp and a premium client page with expiry date.",
    },
  },
  {
    id: "2026-08-22-palette",
    date: "2026-08-22",
    title: { nl: "Zoeken met Ctrl+K", en: "Search with Ctrl+K" },
    body: {
      nl: "Druk overal op Ctrl+K om naar een pagina te springen of direct een factuur of offerte te starten.",
      en: "Press Ctrl+K anywhere to jump to a page or start an invoice or quote right away.",
    },
  },
  {
    id: "2026-08-22-desktop",
    date: "2026-08-22",
    navKey: "desktop",
    href: "/desktop",
    title: { nl: "Windows-app", en: "Windows app" },
    body: {
      nl: "Saldova als echte app op je pc — inbegrepen bij betaalde plannen. Zie Account → Desktop-app.",
      en: "Saldova as a real app on your PC — included with paid plans. See Account → Desktop app.",
    },
  },
];

export const LATEST_WHATS_NEW_ID = WHATS_NEW[0]?.id ?? "";

/** Menu-items die een "Nieuw"-label verdienen (functie jonger dan NEW_BADGE_DAYS). */
export function newNavKeys(now: Date = new Date()): string[] {
  const cutoff = now.getTime() - NEW_BADGE_DAYS * 86_400_000;
  const keys = new Set<string>();
  for (const e of WHATS_NEW) {
    if (e.navKey && new Date(e.date).getTime() >= cutoff) keys.add(e.navKey);
  }
  return [...keys];
}
