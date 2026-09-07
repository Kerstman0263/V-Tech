import { getTranslations } from "next-intl/server";

// Skeleton in de vorm van een echte pagina (kop, KPI's, tabel) met een
// paarse glans — voelt sneller en rustiger dan een spinner, en de overgang
// naar de echte inhoud is klein omdat de vorm al klopt.
export default async function DashboardLoading() {
  const t = await getTranslations("common");
  return (
    <div role="status" aria-live="polite">
      <span className="sr-only">{t("loading")}</span>
      <div aria-hidden="true">
        {/* Paginakop */}
        <div className="skeleton h-7 w-52 rounded-lg" />
        <div className="skeleton mt-3 h-4 w-80 max-w-full rounded" />

        {/* KPI-tegels */}
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="skeleton h-28 rounded-2xl" />
          ))}
        </div>

        {/* Inhoudsblok (tabel/grafiek) */}
        <div className="skeleton mt-6 h-64 rounded-2xl" />
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <div className="skeleton h-40 rounded-2xl" />
          <div className="skeleton h-40 rounded-2xl" />
        </div>
      </div>
    </div>
  );
}
