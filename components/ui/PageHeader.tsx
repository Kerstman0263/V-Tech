// Consistente paginakop met titel, optionele subtitel en actie-slot.
// Witte titel + kort, effen accentlijntje in de paneelkleur: elke pagina opent
// met dezelfde rustige signatuur, zonder per pagina iets te hoeven doen.
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
        <h1 className="text-xl font-bold tracking-tight text-white sm:text-2xl">
          {title}
        </h1>
        <div aria-hidden className="mt-1.5 h-0.5 w-10 rounded-full bg-brand-500" />
        {subtitle && <p className="mt-2 text-sm text-slate-400">{subtitle}</p>}
      </div>
      {action && <div className="flex items-center gap-2">{action}</div>}
    </div>
  );
}
