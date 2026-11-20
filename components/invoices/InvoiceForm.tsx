"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/routing";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { ProductPicker } from "@/components/products/ProductPicker";
import { formatMoney } from "@/lib/utils";
import { calculateInvoiceTotals } from "@/lib/invoice-calc";
import { readApiBody, useApiError } from "@/components/dashboard/api-error";
import { VAT_SCHEMES, customerVatSchemeProblem, effectiveCustomerVatScheme, type VatScheme } from "@/lib/vat-scheme";

interface Customer {
  id: string;
  name: string;
  /** Standaard btw-soort van deze klant. */
  vatScheme?: VatScheme;
  vatNumber?: string | null;
  country?: string | null;
}

export interface KorStatus {
  level: "near" | "over";
  revenue: number;
  threshold: number;
  year: number;
}

export interface InvoiceDefaults {
  vatRate: number;
  kor?: boolean;
  dueDays: number;
  notes: string;
  currency: string;
  previewNumber: string;
}

interface Line {
  description: string;
  quantity: number;
  unitPrice: number;
  vatRate: number;
  timeEntryId?: string;
}

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

export function InvoiceForm({
  customers,
  defaults,
  korStatus = null,
}: {
  customers: Customer[];
  defaults: InvoiceDefaults;
  korStatus?: KorStatus | null;
}) {
  const t = useTranslations("invoices");
  const te = useTranslations("appExtra.errors");
  const apiError = useApiError();
  const router = useRouter();

  const today = new Date();
  const due = new Date();
  due.setDate(due.getDate() + defaults.dueDays);

  const [customerId, setCustomerId] = useState(customers[0]?.id ?? "");
  // Btw-soort: standaard die van de klant. Alles behalve gewone btw = 0% op elke regel.
  // Met de KOR aan vallen btw verlegd binnen Nederland en ICL terug op gewone btw (0%).
  const [vatScheme, setVatScheme] = useState<VatScheme>(effectiveCustomerVatScheme(customers[0]?.vatScheme, !!defaults.kor));
  const customer = customers.find((c) => c.id === customerId);
  const zeroVat = !!defaults.kor || vatScheme !== "STANDARD";
  const lineRate = zeroVat ? 0 : defaults.vatRate;
  const schemeProblem = vatScheme === "STANDARD" ? null : customerVatSchemeProblem({ vatScheme, country: customer?.country, vatNumber: customer?.vatNumber }, { korEnabled: !!defaults.kor });
  const [issueDate, setIssueDate] = useState(isoDate(today));
  const [dueDate, setDueDate] = useState(isoDate(due));
  // Leverdatum of periode (art. 35a Wet OB): optioneel, leeg = factuurdatum.
  const [deliveryDate, setDeliveryDate] = useState("");
  const [deliveryEndDate, setDeliveryEndDate] = useState("");
  const [notes, setNotes] = useState(defaults.notes);
  // Referentie of inkoopordernummer van de klant (optioneel; komt op de PDF en in de e-factuur).
  const [buyerReference, setBuyerReference] = useState("");
  const [lines, setLines] = useState<Line[]>([
    { description: "", quantity: 1, unitPrice: 0, vatRate: lineRate },
  ]);
  const timeEntryIds = lines.flatMap((line) => line.timeEntryId ? [line.timeEntryId] : []);
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Haalt openstaande uren van de gekozen klant op en voegt ze als regels toe.
  async function importHours() {
    if (!customerId || importing) return;
    setImporting(true); setImportMsg(null);
    try {
      const res = await fetch(`/api/time-entries?status=OPEN&customerId=${encodeURIComponent(customerId)}`);
      if (!res.ok) throw new Error("hours_unavailable");
      const entries: { id: string; description: string; hours: number; hourlyRate: number | null; approval: string; invoiceId: string | null }[] = await res.json();
      const eligible = entries.filter((e) => !e.invoiceId && ["APPROVED", "NOT_REQUIRED"].includes(e.approval) && !timeEntryIds.includes(e.id));
      if (!eligible.length) { setImportMsg(t("noOpenHours")); return; }
      setLines((prev) => [...prev.filter((l) => l.description.trim() !== "" || l.unitPrice !== 0), ...eligible.map((e) => ({
        description: e.description, quantity: Number(e.hours), unitPrice: Number(e.hourlyRate ?? 0), vatRate: lineRate, timeEntryId: e.id,
      }))]);
      setImportMsg(t("hoursImported", { count: eligible.length }));
    } catch { setError(t("connectionFailed")); } finally { setImporting(false); }
  }

  const updateLine = (i: number, patch: Partial<Line>) =>
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  const removeLine = (i: number) =>
    setLines((prev) => (prev.length > 1 ? prev.filter((_, idx) => idx !== i) : prev));
  const addLine = () =>
    setLines((prev) => [...prev, { description: "", quantity: 1, unitPrice: 0, vatRate: lineRate }]);
  const chooseScheme = (scheme: VatScheme) => {
    setVatScheme(scheme);
    // Btw verlegd of ICL: geen btw op de regels.
    if (scheme !== "STANDARD") setLines((prev) => prev.map((l) => ({ ...l, vatRate: 0 })));
    else if (!defaults.kor) setLines((prev) => prev.map((l) => (l.vatRate === 0 ? { ...l, vatRate: defaults.vatRate } : l)));
    // KOR-zin hoort niet bij btw verlegd of ICL (daar komt de eigen vermelding op de PDF).
    if (defaults.kor) {
      const korNotice = t("korNotice");
      setNotes((prev) => {
        const without = prev.replace(korNotice, "").replace(/\n{3,}/g, "\n\n").trim();
        return scheme === "STANDARD" ? (prev.includes(korNotice) ? prev : [without, korNotice].filter(Boolean).join("\n\n")) : without;
      });
    }
  };
  // Bij KOR of een andere btw-soort gaat er altijd 0% mee, wat er ook in een regel staat.
  const effectiveLines = zeroVat ? lines.map((l) => ({ ...l, vatRate: 0 })) : lines;

  let totals;
  try { totals = calculateInvoiceTotals(effectiveLines); } catch { totals = null; }
  const invalidTotal = !totals || Math.abs(totals.total) > 99_999_999.99;
  totals ??= calculateInvoiceTotals([]);
  const { subtotal, vatAmount: vat, total } = totals;
  const money = (n: number) => formatMoney(n, "nl", defaults.currency);

  const deliveryEndBeforeStart = !!deliveryDate && !!deliveryEndDate && deliveryEndDate < deliveryDate;

  async function submit() {
    if (saving || invalidTotal) return;
    if (deliveryEndBeforeStart) { setError(t("deliveryEndBeforeStart")); return; }
    setSaving(true);
    setError(null);
    try {
    const res = await fetch("/api/invoices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customerId, issueDate, dueDate, notes, lineItems: effectiveLines, timeEntryIds, vatScheme,
        buyerReference: buyerReference.trim() || undefined,
        // Leeg = niet meesturen (een lege datum is geen geldige datum).
        deliveryDate: deliveryDate || undefined,
        deliveryEndDate: deliveryDate && deliveryEndDate ? deliveryEndDate : undefined,
      }),
    });
    setSaving(false);
    if (!res.ok) {
      // 402 = plan-limiet: in het Nederlands de uitleg van de server (met
      // upgrade-advies), anders een vertaalde melding. Nooit een kale technische tekst.
      setError(apiError(res.status, await readApiBody(res), res.status === 402 ? te("planLimit") : t("saveError")));
      return;
    }
    router.push("/invoices");
    router.refresh();
    } catch { setError(t("saveError")); } finally { setSaving(false); }
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Kop: klant, nummer, data */}
      <div className="rounded-2xl border border-white/[0.06] bg-kaart backdrop-blur-md p-5">
        <div className="grid gap-4 md:grid-cols-2">
          <Select
            label={t("customer")}
            value={customerId}
            onChange={(value) => {
              setCustomerId(value); setImportMsg(null);
              setLines((prev) => { const kept = prev.filter((line) => !line.timeEntryId); return kept.length ? kept : [{ description: "", quantity: 1, unitPrice: 0, vatRate: lineRate }]; });
              chooseScheme(effectiveCustomerVatScheme(customers.find((c) => c.id === value)?.vatScheme, !!defaults.kor));
            }}
            options={customers.map((c) => ({ value: c.id, label: c.name }))}
          />
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-slate-300">{t("number")}</label>
            <div className="rounded-lg border border-dashed border-white/10 bg-white/[0.03] px-3 py-2 font-mono text-sm text-slate-400">
              {defaults.previewNumber}
            </div>
          </div>
          <Input type="date" label={t("issueDate")} value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
          <Input type="date" label={t("dueDate")} value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          <Input type="date" label={t("deliveryDate")} value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} />
          <Input type="date" label={t("deliveryEndDate")} value={deliveryEndDate} min={deliveryDate || undefined} disabled={!deliveryDate} onChange={(e) => setDeliveryEndDate(e.target.value)} />
        </div>
        <p className="mt-2 text-xs leading-relaxed text-slate-400">{t("deliveryHint")}</p>
        {deliveryEndBeforeStart && <p role="alert" className="mt-2 text-xs text-amber-300">{t("deliveryEndBeforeStart")}</p>}
        <div className="mt-4 grid gap-2 md:grid-cols-2">
          <Input label={t("buyerReference")} value={buyerReference} maxLength={100} onChange={(e) => setBuyerReference(e.target.value)} aria-describedby="invoice-buyer-reference-hint" />
          <p id="invoice-buyer-reference-hint" className="self-end text-xs leading-relaxed text-slate-400">{t("buyerReferenceHint")}</p>
        </div>
        <div className="mt-4 grid gap-2 md:grid-cols-2">
          <Select
            label={t("vatSchemeLabel")}
            value={vatScheme}
            onChange={(value) => chooseScheme(value as VatScheme)}
            options={VAT_SCHEMES.map((scheme) => ({ value: scheme, label: t(`vatSchemes.${scheme}`) }))}
          />
          <p className="self-end text-xs leading-relaxed text-slate-400">{t(`vatSchemeHints.${vatScheme}`)}</p>
        </div>
        {schemeProblem && <p role="alert" className="mt-2 text-xs text-amber-300">{schemeProblem}</p>}
        {defaults.kor && (
          <p className="mt-4 rounded-xl border border-brand-500/20 bg-brand-500/[0.08] px-3 py-2 text-xs text-brand-200">
            {t("korActive")}
          </p>
        )}
        {korStatus && (
          <p role={korStatus.level === "over" ? "alert" : "status"} className={korStatus.level === "over" ? "mt-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200" : "mt-2 rounded-xl border border-amber-500/20 bg-amber-500/[0.06] px-3 py-2 text-xs text-amber-200"}>
            {t(korStatus.level === "over" ? "korThresholdOver" : "korThresholdNear", { revenue: money(korStatus.revenue), threshold: money(korStatus.threshold), year: korStatus.year })}
          </p>
        )}
      </div>

      {/* Regels */}
      <div className="rounded-2xl border border-white/[0.06] bg-kaart backdrop-blur-md p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-semibold">{t("lineItems")}</h3>
          <div className="flex flex-wrap items-center gap-2">
          {/* Catalogus: één klik vult een regel met naam, prijs en btw */}
          <ProductPicker
            onPick={(p) =>
              setLines((prev) => [
                ...prev.filter((l) => l.description.trim() !== "" || l.unitPrice !== 0),
                { description: p.name, quantity: 1, unitPrice: p.unitPrice, vatRate: p.vatRate },
              ])
            }
          />
          <button
            type="button"
            onClick={importHours}
            disabled={importing || !customerId}
            className="rounded-lg border border-brand-500/20 bg-brand-500/10 px-3 py-1.5 text-xs font-semibold text-brand-300 hover:bg-brand-500/20 disabled:opacity-50"
          >
            {importing ? "..." : t("importHours")}
          </button>
          </div>
        </div>
        {importMsg && <p className="mb-2 text-xs text-slate-400">{importMsg}</p>}
        <div className="hidden grid-cols-12 gap-2 px-1 pb-1 text-xs font-medium text-slate-500 md:grid">
          <span className="col-span-6">{t("description")}</span>
          <span className="col-span-1 text-right">{t("quantity")}</span>
          <span className="col-span-2 text-right">{t("unitPrice")}</span>
          <span className="col-span-1 text-right">{t("vatRate")}</span>
          <span className="col-span-2 text-right">{t("total")}</span>
        </div>
        <div className="flex flex-col gap-2">
          {lines.map((line, i) => (
            <div key={i} className="grid grid-cols-12 items-center gap-2">
              <input
                placeholder={t("description")}
                className="col-span-12 rounded-lg border border-white/10 px-3 py-2 text-sm bg-white/[0.03] text-white placeholder-slate-500 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 md:col-span-6"
                aria-label={t("description") + " " + (i + 1)}
                value={line.description}
                onChange={(e) => updateLine(i, { description: e.target.value })}
              />
              <input
                type="number" step="0.01"
                className="tabular col-span-3 rounded-lg border border-white/10 px-2 py-2 text-right text-sm bg-white/[0.03] text-white placeholder-slate-500 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 md:col-span-1"
                aria-label={t("quantity") + " " + (i + 1)}
                value={line.quantity}
                onChange={(e) => updateLine(i, { quantity: Number(e.target.value) })}
              />
              <input
                type="number" step="0.01"
                className="tabular col-span-4 rounded-lg border border-white/10 px-2 py-2 text-right text-sm bg-white/[0.03] text-white placeholder-slate-500 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 md:col-span-2"
                aria-label={t("unitPrice") + " " + (i + 1)}
                value={line.unitPrice}
                onChange={(e) => updateLine(i, { unitPrice: Number(e.target.value) })}
              />
              <input
                type="number" step="1"
                className="tabular col-span-3 rounded-lg border border-white/10 px-2 py-2 text-right text-sm bg-white/[0.03] text-white placeholder-slate-500 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 disabled:opacity-60 md:col-span-1"
                aria-label={t("vatRate") + " " + (i + 1)}
                disabled={zeroVat}
                value={zeroVat ? 0 : line.vatRate}
                onChange={(e) => updateLine(i, { vatRate: Number(e.target.value) })}
              />
              <div className="col-span-2 flex items-center justify-end gap-1 text-right text-sm font-medium md:col-span-2">
                {money(totals.lineItems[i]?.lineTotal ?? 0)}
                <button
                  type="button"
                  onClick={() => removeLine(i)}
                  className="ml-1 text-slate-600 hover:text-rose-500"
                  aria-label="x"
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>
        <Button variant="secondary" className="mt-3" onClick={addLine} type="button">
          + {t("addLine")}
        </Button>
      </div>

      {/* Notities + totalen */}
      <div className="grid gap-5 md:grid-cols-2">
        <div className="flex flex-col gap-1">
          <label htmlFor="invoice-notes" className="text-sm font-medium text-slate-300">{t("notes")}</label>
          <textarea
            id="invoice-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={4}
            className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white placeholder-slate-500"
          />
        </div>
        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] p-5">
          <div className="flex justify-between py-1 text-sm text-slate-400">
            <span>{t("subtotal")}</span><span>{money(subtotal)}</span>
          </div>
          <div className="flex justify-between py-1 text-sm text-slate-400">
            <span>{t("vat")}</span><span>{money(vat)}</span>
          </div>
          <div className="mt-2 flex justify-between border-t border-white/[0.06] pt-2 text-base font-bold text-white">
            <span>{t("total")}</span><span>{money(total)}</span>
          </div>
        </div>
      </div>

      {invalidTotal && <p role="alert" className="text-sm text-rose-200">{t("amountTooLarge")}</p>}
      {error && <p role="alert" className="text-sm text-rose-400">{error}</p>}

      <div className="flex gap-2">
        <Button onClick={submit} disabled={invalidTotal || saving || !customerId}>
          {saving ? "..." : t("create")}
        </Button>
      </div>
    </div>
  );
}
