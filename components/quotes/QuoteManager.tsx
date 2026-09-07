"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import { formatMoney } from "@/lib/utils";
import { Card } from "@/components/ui/Card";
import { StatCard } from "@/components/ui/StatCard";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { EmptyState } from "@/components/ui/EmptyState";
import { QuoteStatusBadge } from "@/components/ui/StatusBadge";

type Status = "DRAFT" | "SENT" | "ACCEPTED" | "DECLINED" | "EXPIRED" | "CONVERTED";

interface Quote {
  id: string;
  quoteNumber: string;
  status: Status;
  issueDate: string;
  validUntil: string | null;
  total: string;
  currency: string;
  customer: { name: string };
}

const STATUSES: ("ALL" | Status)[] = ["ALL", "DRAFT", "SENT", "ACCEPTED", "DECLINED", "EXPIRED", "CONVERTED"];

export function QuoteManager({ locale }: { locale: string }) {
  const t = useTranslations("quotes");
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<"ALL" | Status>("ALL");
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    const res = await fetch("/api/quotes");
    if (res.ok) setQuotes(await res.json());
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    return quotes.filter((q) => {
      if (status !== "ALL" && q.status !== status) return false;
      if (search && !`${q.quoteNumber} ${q.customer.name}`.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [quotes, status, search]);

  const money = (n: number) => formatMoney(n, locale, "EUR");
  const acceptedValue = quotes.filter((q) => q.status === "ACCEPTED").reduce((s, q) => s + Number(q.total), 0);
  const openValue = quotes.filter((q) => q.status === "SENT").reduce((s, q) => s + Number(q.total), 0);

  if (loading) return <p className="text-sm text-slate-500">…</p>;

  if (quotes.length === 0) {
    return (
      <EmptyState
        icon="invoice"
        title={t("empty")}
        action={<span data-tour="quotes-create" className="inline-flex"><Link href="/quotes/new" className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700">+ {t("new")}</Link></span>}
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label={t("kpiCount")} value={String(quotes.length)} icon="invoice" tone="brand" />
        <StatCard label={t("kpiOpen")} value={money(openValue)} icon="send" tone="amber" />
        <StatCard label={t("kpiAccepted")} value={money(acceptedValue)} icon="check-circle" tone="green" />
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <Input placeholder={t("searchPlaceholder")} value={search} onChange={(e) => setSearch(e.target.value)} className="w-56" />
        <Select
          className="w-44"
          value={status}
          onChange={(v) => setStatus(v as "ALL" | Status)}
          options={STATUSES.map((s) => ({ value: s, label: s === "ALL" ? t("filterAll") : t(`status.${s.toLowerCase()}`) }))}
        />
        <div data-tour="quotes-create" className="ml-auto flex">
          <Link href="/quotes/new" className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700">+ {t("new")}</Link>
        </div>
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-white/[0.03] text-left text-slate-400">
            <tr>
              <th className="px-5 py-2.5 font-medium">{t("number")}</th>
              <th className="px-5 py-2.5 font-medium">{t("customer")}</th>
              <th className="px-5 py-2.5 font-medium">{t("issueDate")}</th>
              <th className="px-5 py-2.5 text-right font-medium">{t("total")}</th>
              <th className="px-5 py-2.5 font-medium">{t("statusLabel")}</th>
              <th className="px-5 py-2.5 text-right font-medium">PDF</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((q) => (
              <tr key={q.id} className="border-t border-white/[0.04] hover:bg-white/[0.03]">
                <td className="px-5 py-3 font-medium">
                  <Link href={`/quotes/${q.id}`} className="text-brand-400 hover:underline">{q.quoteNumber}</Link>
                </td>
                <td className="px-5 py-3 text-slate-400">{q.customer.name}</td>
                <td className="px-5 py-3 text-slate-400">{q.issueDate.slice(0, 10)}</td>
                <td className="px-5 py-3 text-right font-medium text-white">{money(Number(q.total))}</td>
                <td className="px-5 py-3"><QuoteStatusBadge status={q.status} /></td>
                <td className="px-5 py-3 text-right">
                  <a href={`/api/quotes/${q.id}/pdf`} className="text-brand-400 hover:underline">↓</a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </Card>
    </div>
  );
}
