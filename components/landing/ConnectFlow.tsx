import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/utils";

// Drie "schermafdrukken" van het koppelen van een webshop, nagebouwd in HTML
// zodat ze scherp blijven en meevertalen. Zelfde opbouw als de echte
// Koppelingen-pagina in de app. Voorbeelddata, geen echte klant.

function Frame({ url, children }: { url: string; children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-rand bg-kaart shadow-[0_24px_60px_-20px_rgba(0,0,0,0.8)]">
      <div className="flex items-center gap-2 border-b border-rand bg-kaart px-4 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-rose-400/70" />
        <span className="h-2.5 w-2.5 rounded-full bg-amber-400/70" />
        <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/70" />
        <span className="ml-2 truncate rounded-md bg-white/[0.04] px-2.5 py-0.5 text-[11px] text-slate-400">{url}</span>
      </div>
      <div className="h-[290px] p-5">{children}</div>
    </div>
  );
}

export function ConnectFlow() {
  const t = useTranslations("webshops.flow");

  const platforms = [
    { name: "Shopify", active: true },
    { name: "WooCommerce" },
    { name: "Bol.com" },
    { name: "Etsy (CSV)" },
    { name: "Amazon (CSV)" },
    { name: "Andere CSV" },
  ];
  const orders = [
    { nr: "#1284", c: "NL", amt: "€ 49,95" },
    { nr: "#1283", c: "DE", amt: "€ 89,00" },
    { nr: "#1282", c: "BE", amt: "€ 24,50" },
    { nr: "#1281", c: "NL", amt: "−€ 19,95", refund: true },
  ];

  return (
    <ol className="grid gap-8 lg:grid-cols-3">
      {/* Stap 1 — platform kiezen */}
      <li>
        <Frame url="saldova.nl/koppelingen">
          <p className="text-sm font-semibold text-white">{t("s1.screenTitle")}</p>
          <div className="mt-4 grid grid-cols-2 gap-2.5">
            {platforms.map((p) => (
              <div
                key={p.name}
                className={cn(
                  "flex items-center gap-2 rounded-xl border px-3 py-2.5 text-xs font-semibold",
                  p.active ? "border-brand-400/60 bg-brand-500/15 text-white ring-2 ring-brand-500/30" : "border-rand bg-grond text-slate-300",
                )}
              >
                <Icon name="store" className="h-3.5 w-3.5 text-brand-300" />
                <span className="truncate">{p.name}</span>
              </div>
            ))}
          </div>
          <div className="mt-4 rounded-xl bg-brand-600 py-2.5 text-center text-xs font-semibold text-white">{t("s1.button")}</div>
        </Frame>
        <p className="mt-5 font-display text-sm font-bold text-brand-300">01</p>
        <h3 className="mt-1 font-display text-xl font-bold">{t("s1.title")}</h3>
        <p className="mt-1.5 text-sm leading-relaxed text-slate-400">{t("s1.desc")}</p>
      </li>

      {/* Stap 2 — sleutel invullen */}
      <li>
        <Frame url="saldova.nl/koppelingen/shopify">
          <p className="text-sm font-semibold text-white">{t("s2.screenTitle")}</p>
          <label className="mt-4 block text-[11px] font-medium text-slate-400">{t("s2.shopLabel")}</label>
          <div className="mt-1 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-slate-200">mijnwinkel.myshopify.com</div>
          <label className="mt-3 block text-[11px] font-medium text-slate-400">{t("s2.keyLabel")}</label>
          <div className="mt-1 flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-slate-200">
            <span>shpat_••••••••••••••3f9a</span>
            <Icon name="lock" className="h-3.5 w-3.5 text-emerald-400" />
          </div>
          <p className="mt-3 flex items-center gap-1.5 text-[11px] text-slate-400">
            <Icon name="shield" className="h-3.5 w-3.5" />
            {t("s2.safe")}
          </p>
          <div className="mt-4 rounded-xl bg-brand-600 py-2.5 text-center text-xs font-semibold text-white">{t("s2.button")}</div>
        </Frame>
        <p className="mt-5 font-display text-sm font-bold text-brand-300">02</p>
        <h3 className="mt-1 font-display text-xl font-bold">{t("s2.title")}</h3>
        <p className="mt-1.5 text-sm leading-relaxed text-slate-400">{t("s2.desc")}</p>
      </li>

      {/* Stap 3 — gekoppeld, orders binnen */}
      <li>
        <Frame url="saldova.nl/koppelingen/shopify">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-white">Shopify</p>
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-300">
              <Icon name="check" className="h-3 w-3" />
              {t("s3.connected")}
            </span>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="rounded-xl bg-white/[0.04] p-2.5">
              <p className="text-[10px] text-slate-400">{t("s3.imported")}</p>
              <p className="font-display text-base font-bold text-white">1.284</p>
            </div>
            <div className="rounded-xl bg-white/[0.04] p-2.5">
              <p className="text-[10px] text-slate-400">{t("s3.revenue")}</p>
              <p className="font-display text-base font-bold text-white">€ 26.155</p>
            </div>
          </div>
          <table className="mt-3 w-full text-[11px]">
            <tbody>
              {orders.map((o) => (
                <tr key={o.nr} className="border-t border-rand">
                  <td className="py-1.5 text-slate-300">{o.nr}</td>
                  <td className="py-1.5 text-slate-400">{o.c}</td>
                  <td className={cn("py-1.5 text-right font-semibold tabular-nums", o.refund ? "text-rose-300" : "text-white")}>{o.amt}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Frame>
        <p className="mt-5 font-display text-sm font-bold text-brand-300">03</p>
        <h3 className="mt-1 font-display text-xl font-bold">{t("s3.title")}</h3>
        <p className="mt-1.5 text-sm leading-relaxed text-slate-400">{t("s3.desc")}</p>
      </li>
    </ol>
  );
}
