"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { formatMoney } from "@/lib/utils";

interface Item {
  description: string;
  quantity: number;
  unitPrice: number;
}

// Publieke sectie waarin de klant eigen regels/wensen + een bericht kan
// toevoegen en opslaan. Verandert de offertebedragen niet; het zijn
// aanvullingen die de ondernemer ziet en beoordeelt.
export function QuoteClientEdit({
  token,
  initialItems,
  initialNote,
  editable,
  currency = "EUR",
  locale = "nl",
}: {
  token: string;
  initialItems: Item[];
  initialNote: string;
  editable: boolean;
  currency?: string;
  locale?: string;
}) {
  const t = useTranslations("quotes");
  const [items, setItems] = useState<Item[]>(initialItems);
  const [note, setNote] = useState(initialNote);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const money = (n: number) => formatMoney(n, locale, currency);

  // Gesloten offerte: alleen tonen wat de klant eerder toevoegde
  if (!editable) {
    if (items.length === 0 && !note) return null;
    return (
      <div className="rounded-2xl border border-white/[0.06] bg-[#12112a]/60 backdrop-blur-md p-5">
        <h3 className="font-semibold text-white">{t("clientView")}</h3>
        {items.map((li, i) => (
          <p key={i} className="mt-1 text-sm text-slate-400">• {li.description} — {li.quantity} × {money(li.unitPrice)}</p>
        ))}
        {note && <p className="mt-2 whitespace-pre-wrap text-sm text-slate-400">{note}</p>}
      </div>
    );
  }

  const update = (i: number, patch: Partial<Item>) => setItems((p) => p.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  const remove = (i: number) => setItems((p) => p.filter((_, idx) => idx !== i));
  const add = () => setItems((p) => [...p, { description: "", quantity: 1, unitPrice: 0 }]);

  async function save() {
    setSaving(true);
    setSaved(false);
    const clean = items.filter((it) => it.description.trim() !== "");
    const res = await fetch(`/api/public/quotes/${token}/edit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lineItems: clean, note }),
    });
    setSaving(false);
    if (res.ok) {
      setItems(clean);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    }
  }

  return (
    <div className="rounded-2xl border border-white/[0.06] bg-[#12112a]/60 backdrop-blur-md p-5">
      <h3 className="font-semibold text-white">{t("clientTitle")}</h3>
      <p className="mt-1 text-sm text-slate-400">{t("clientSub")}</p>

      <div className="mt-4 flex flex-col gap-2">
        {items.map((line, i) => (
          <div key={i} className="grid grid-cols-12 items-center gap-2">
            <input
              placeholder={t("description")}
              className="col-span-12 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white placeholder-slate-500 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 sm:col-span-7"
              value={line.description}
              onChange={(e) => update(i, { description: e.target.value })}
            />
            <input
              type="number" step="0.5" min="0"
              className="col-span-5 rounded-lg border border-white/10 bg-white/[0.03] px-2 py-2 text-right text-sm text-white outline-none focus:border-brand-500 sm:col-span-2"
              value={line.quantity}
              onChange={(e) => update(i, { quantity: Number(e.target.value) })}
            />
            <div className="col-span-7 flex items-center gap-1 sm:col-span-3">
              <div className="relative flex-1">
                <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-xs text-slate-500">€</span>
                <input
                  type="number" step="0.01" min="0"
                  className="w-full rounded-lg border border-white/10 bg-white/[0.03] py-2 pl-6 pr-2 text-right text-sm text-white outline-none focus:border-brand-500"
                  value={line.unitPrice}
                  onChange={(e) => update(i, { unitPrice: Number(e.target.value) })}
                />
              </div>
              <button type="button" onClick={() => remove(i)} className="text-slate-600 hover:text-rose-500" aria-label="x">✕</button>
            </div>
          </div>
        ))}
        <button type="button" onClick={add} className="self-start rounded-lg border border-brand-500/20 bg-brand-500/10 px-3 py-1.5 text-xs font-semibold text-brand-300 hover:bg-brand-500/20">
          + {t("clientAddLine")}
        </button>
      </div>

      <div className="mt-4 flex flex-col gap-1">
        <label className="text-sm font-medium text-slate-300">{t("clientNoteLabel")}</label>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          placeholder={t("clientNotePlaceholder")}
          className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white placeholder-slate-500 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
        />
      </div>

      <div className="mt-3 flex items-center gap-3">
        <button onClick={save} disabled={saving} className="rounded-lg bg-brand-600 px-5 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50">
          {saving ? "..." : t("clientSave")}
        </button>
        {saved && <span className="text-sm text-emerald-400">{t("clientSaved")}</span>}
      </div>
    </div>
  );
}
