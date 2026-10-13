"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { Link } from "@/i18n/routing";
import { cn, formatMoney } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Card } from "@/components/ui/Card";
import { StatCard } from "@/components/ui/StatCard";
import { InvoiceStatusBadge } from "@/components/ui/StatusBadge";

type Status = "DRAFT" | "SENT" | "PAID" | "OVERDUE" | "CANCELED";
type Period = "MONTH" | "QUARTER" | "YEAR" | "ALL";

interface Invoice {
  id: string;
  invoiceNumber: string;
  status: Status;
  issueDate: string;
  dueDate?: string | null;
  total: string | number;
  currency: string;
  customer: { name: string };
}

export function InvoiceManager() {
  const t = useTranslations("invoices");
  const tc = useTranslations("common");
  const locale = useLocale();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<Status | "ALL">("ALL");
  const [period, setPeriod] = useState<Period>("ALL");
  // Filter uit de link overnemen (bijv. "Vandaag doen" -> /invoices?status=OVERDUE).
  useEffect(() => {
    const wanted = new URLSearchParams(window.location.search).get("status");
    if (wanted && ["DRAFT", "SENT", "PAID", "OVERDUE", "CANCELED"].includes(wanted)) setStatus(wanted as Status);
  }, []);

  const load = useCallback(async () => {
    const res = await fetch("/api/invoices");
    if (res.ok) setInvoices(await res.json());
  }, []);
  useEffect(() => { load(); }, [load]);

  const now = new Date();
  const inPeriod = (iso: string) => {
    if (period === "ALL") return true;
    const d = new Date(iso);
    if (d.getFullYear() !== now.getFullYear()) return false;
    if (period === "YEAR") return true;
    if (period === "MONTH") return d.getMonth() === now.getMonth();
    return Math.floor(d.getMonth() / 3) === Math.floor(now.getMonth() / 3);
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return invoices
      // "Te laat" omvat ook verzonden facturen waarvan de vervaldatum al voorbij is.
      .filter((i) => (status === "ALL" ? true : status === "OVERDUE" ? i.status === "OVERDUE" || (i.status === "SENT" && !!i.dueDate && new Date(i.dueDate) < new Date()) : i.status === status))
      .filter((i) => inPeriod(i.issueDate))
      .filter((i) => (!q ? true : `${i.invoiceNumber} ${i.customer.name}`.toLowerCase().includes(q)));
  }, [invoices, search, status, period]); // eslint-disable-line react-hooks/exhaustive-deps

  const paid = filtered.filter((i) => i.status === "PAID").reduce((s, i) => s + Number(i.total), 0);
  const open = filtered.filter((i) => i.status === "SENT" || i.status === "OVERDUE").reduce((s, i) => s + Number(i.total), 0);

  function exportCsv() {
    const header = [t("number"), t("customer"), t("issueDate"), t("total"), tc("status")];
    const rows = filtered.map((i) => [i.invoiceNumber, i.customer.name, i.issueDate.slice(0, 10), Number(i.total).toFixed(2), t(`status.${i.status.toLowerCase()}`)]);
    const csv = [header, ...rows].map((r) => r.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(";")).join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "facturen.csv"; a.click();
    URL.revokeObjectURL(url);
  }

  const statuses: (Status | "ALL")[] = ["ALL", "DRAFT", "SENT", "PAID", "OVERDUE", "CANCELED"];
  const periods: Period[] = ["ALL", "MONTH", "QUARTER", "YEAR"];
  const periodLabel: Record<Period, string> = { ALL: t("periodAll"), MONTH: t("periodMonth"), QUARTER: t("periodQuarter"), YEAR: t("periodYear") };

  return (
    <div className="flex flex-col gap-6">
      <div data-tour="invoices-overview" className="grid gap-4 sm:grid-cols-3">
        <StatCard label={t("kpiCount")} value={String(filtered.length)} icon="receipt" tone="brand" />
        <StatCard label={t("kpiPaid")} value={formatMoney(paid, locale)} icon="check-circle" tone="green" />
        <StatCard label={t("kpiOpen")} value={formatMoney(open, locale)} icon="hourglass" tone="amber" />
      </div>

      <div data-tour="invoices-filters" className="flex flex-wrap items-center gap-2">
        <Input placeholder={t("searchPlaceholder")} value={search} onChange={(e) => setSearch(e.target.value)} className="w-56" />
        <Select
          className="w-44"
          value={status}
          onChange={(v) => setStatus(v as Status | "ALL")}
          options={[
            { value: "ALL", label: t("filterAllStatus") },
            { value: "DRAFT", label: t("status.draft") },
            { value: "SENT", label: t("status.sent") },
            { value: "PAID", label: t("status.paid") },
            { value: "OVERDUE", label: t("status.overdue") },
            { value: "CANCELED", label: t("status.canceled") },
          ]}
        />
        <Select
          className="w-40"
          value={period}
          onChange={(v) => setPeriod(v as Period)}
          options={periods.map((p) => ({ value: p, label: periodLabel[p] }))}
        />
        <div className="flex-1" />
        <div data-tour="invoices-export">
          <Button variant="secondary" onClick={exportCsv} disabled={filtered.length === 0}>⬇ {t("export")}</Button>
        </div>
        <div data-tour="invoices-create" className="flex">
          <Link href="/invoices/new" className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700">+ {t("new")}</Link>
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-slate-400">{invoices.length === 0 ? t("empty") : t("noResults")}</p>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-sm">
              <thead className="bg-white/[0.03] text-left text-slate-400">
                <tr>
                  <th className="px-5 py-2.5 font-medium">{t("number")}</th>
                  <th className="px-5 py-2.5 font-medium">{t("customer")}</th>
                  <th className="px-5 py-2.5 font-medium">{t("issueDate")}</th>
                  <th className="px-5 py-2.5 font-medium">{t("total")}</th>
                  <th className="px-5 py-2.5 font-medium">{tc("status")}</th>
                  <th className="px-5 py-2.5 text-right font-medium">PDF</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((i) => (
                  <tr key={i.id} className="border-t border-white/[0.04] hover:bg-white/[0.03]">
                    <td className="px-5 py-2.5 font-medium">
                      <Link href={`/invoices/${i.id}`} className="text-brand-400 hover:underline">{i.invoiceNumber}</Link>
                    </td>
                    <td className="px-5 py-2.5 text-slate-400">{i.customer.name}</td>
                    <td className="px-5 py-2.5 text-slate-400">{i.issueDate.slice(0, 10)}</td>
                    <td className="px-5 py-2.5 font-medium text-white">{formatMoney(Number(i.total), locale, i.currency)}</td>
                    <td className="px-5 py-2.5"><InvoiceStatusBadge status={i.status} /></td>
                    <td className="px-5 py-2.5 text-right">
                      <a href={`/api/invoices/${i.id}/pdf`} className="font-medium text-brand-400 hover:underline">↓</a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
