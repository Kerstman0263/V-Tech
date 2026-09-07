// Consistente paginakop met titel, optionele subtitel en actie-slot.
// Gradient-titel + kort accentlijntje: elke pagina opent met dezelfde
// premium signatuur, zonder per pagina iets te hoeven doen.
export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3 sm:gap-4">
      <div className="min-w-0">
        <h1 className="bg-gradient-to-r from-white via-white to-brand-200 bg-clip-text text-xl font-bold tracking-tight text-transparent sm:text-2xl">
          {title}
        </h1>
        <div aria-hidden className="mt-1.5 h-0.5 w-10 rounded-full bg-gradient-to-r from-brand-500 to-fuchsia-500" />
        {subtitle && <p className="mt-2 text-sm text-slate-400">{subtitle}</p>}
      </div>
      {action && <div className="flex items-center gap-2">{action}</div>}
    </div>
  );
}
