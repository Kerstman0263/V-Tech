import { cn } from "@/lib/utils";
import { Link } from "@/i18n/routing";
import { Icon, type IconName } from "@/components/ui/Icon";

type Tone = "brand" | "green" | "amber" | "teal" | "rose";

const tones: Record<
  Tone,
  { bar: string; glow: string; iconBg: string; iconText: string; value: string; sub: string }
> = {
  brand: {
    bar: "from-brand-500 to-fuchsia-400",
    glow: "bg-brand-500/30",
    iconBg: "bg-brand-500/10",
    iconText: "text-brand-300",
    value: "from-brand-600 to-fuchsia-500",
    sub: "text-brand-300",
  },
  green: {
    bar: "from-emerald-500 to-teal-500",
    glow: "bg-emerald-500/30",
    iconBg: "bg-emerald-500/10",
    iconText: "text-emerald-400",
    value: "from-emerald-600 to-teal-600",
    sub: "text-emerald-400",
  },
  amber: {
    bar: "from-amber-500 to-orange-500",
    glow: "bg-amber-500/30",
    iconBg: "bg-amber-500/10",
    iconText: "text-amber-400",
    value: "from-amber-600 to-orange-600",
    sub: "text-amber-400",
  },
  teal: {
    bar: "from-teal-500 to-cyan-500",
    glow: "bg-teal-500/30",
    iconBg: "bg-teal-500/10",
    iconText: "text-teal-400",
    value: "from-teal-600 to-cyan-600",
    sub: "text-teal-400",
  },
  rose: {
    bar: "from-rose-500 to-pink-500",
    glow: "bg-rose-500/30",
    iconBg: "bg-rose-500/10",
    iconText: "text-rose-400",
    value: "from-rose-600 to-pink-600",
    sub: "text-rose-400",
  },
};

// Premium glas-KPI-tegel met gloed, gradient-cijfer en hover-lift.
// `icon` is een naam uit de professionele iconenset (components/ui/Icon).
export function StatCard({
  label,
  value,
  icon,
  tone = "brand",
  sub,
  href,
}: {
  label: string;
  value: string;
  icon: IconName;
  tone?: Tone;
  sub?: string;
  /** Maakt de tegel klikbaar (link naar de detailpagina). */
  href?: string;
}) {
  const c = tones[tone];
  const inner = (
    <>
      {/* Bovenrand-accent */}
      <div className={cn("absolute inset-x-0 top-0 h-1 bg-gradient-to-r", c.bar)} />
      {/* Gloed */}
      <div className={cn("pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full blur-2xl transition-opacity duration-300 opacity-60 group-hover:opacity-100", c.glow)} />

      <div className="relative flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-slate-400">{label}</p>
          <p className="mt-2 text-2xl font-extrabold tracking-tight text-white">
            {value}
          </p>
          {sub && <p className={cn("mt-1 text-xs font-medium", c.sub)}>{sub}</p>}
        </div>
        <div className={cn("flex h-11 w-11 items-center justify-center rounded-xl ring-1 ring-white/5", c.iconBg, c.iconText)}>
          <Icon name={icon} className="h-5 w-5" />
        </div>
      </div>
      {/* Subtiele "ga naar"-pijl, alleen bij klikbare tegels */}
      {href && (
        <span className="pointer-events-none absolute bottom-4 right-4 text-slate-600 opacity-0 transition-all duration-200 group-hover:translate-x-0.5 group-hover:text-slate-300 group-hover:opacity-100">→</span>
      )}
    </>
  );

  const base =
    "group relative overflow-hidden rounded-2xl border border-white/[0.05] bg-[#12112a]/60 p-5 backdrop-blur-md transition-all duration-300";

  if (href) {
    return (
      <Link href={href} className={cn(base, "block cursor-pointer hover:scale-[1.01] hover:border-white/10 hover:bg-[#161535]/80")}>
        {inner}
      </Link>
    );
  }
  return <div className={cn(base, "hover:-translate-y-1 hover:border-white/10")}>{inner}</div>;
}
