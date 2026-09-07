/**
 * Registry van per-pagina walkthroughs. GEGENEREERD uit de walkthrough-build;
 * de data-tour ankers staan in de paginacomponenten, de teksten in
 * messages/*.json onder pageTours.<key>.s<n>. Volgorde = stapvolgorde.
 */
export interface PageTourDef {
  /** Route zonder locale-prefix, exact — bijv. "/invoices". */
  route: string;
  /** data-tour ankerwaarden, in stapvolgorde. */
  anchors: string[];
}

export const PAGE_TOURS: Record<string, PageTourDef> = {
  invoices: { route: "/invoices", anchors: ["invoices-overview", "invoices-create", "invoices-filters", "invoices-export"] },
  quotes: { route: "/quotes", anchors: ["quotes-intro", "quotes-create", "quotes-overview"] },
  snelleOfferte: { route: "/snelle-offerte", anchors: ["snelle-offerte-form", "snelle-offerte-lines", "snelle-offerte-generate", "snelle-offerte-list"] },
  expenses: { route: "/expenses", anchors: ["expenses-kpis", "expenses-new", "expenses-filter", "expenses-list", "expenses-inbox"] },
  bank: { route: "/bank", anchors: ["bank-kpis", "bank-import", "bank-match", "bank-transactions"] },
  vat: { route: "/btw", anchors: ["vat-boxes", "vat-quarter", "vat-balance", "vat-export"] },
  time: { route: "/time", anchors: ["time-kpis", "time-new", "time-timer", "time-chart", "time-approvals"] },
  mileage: { route: "/mileage", anchors: ["mileage-kpis", "mileage-new", "mileage-filters", "mileage-chart"] },
  tasks: { route: "/tasks", anchors: ["tasks-kpis", "tasks-new", "tasks-board", "tasks-filters"] },
  fiscaleRust: { route: "/fiscale-rust", anchors: ["fiscale-rust-input", "fiscale-rust-import", "fiscale-rust-ib-slider", "fiscale-rust-result"] },
  projects: { route: "/projects", anchors: ["projects-kpis", "projects-new", "projects-archived", "projects-export"] },
  customers: { route: "/customers", anchors: ["customers-kpis", "customers-new", "customers-search", "customers-export"] },
  team: { route: "/team", anchors: ["team-seats", "team-add", "team-activity"] },
  leave: { route: "/verlof", anchors: ["leave-balance", "leave-request", "leave-requests", "leave-budgets"] },
  activity: { route: "/activiteit", anchors: ["activity-intro", "activity-log", "activity-search"] },
  settings: { route: "/settings", anchors: ["settings-account-overview", "settings-profile", "settings-billing", "settings-export", "settings-inbound"] },
  desktop: { route: "/desktop", anchors: ["desktop-hero", "desktop-get-app", "desktop-features", "desktop-phone-note"] },
};
