"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/routing";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

interface Customer {
  id: string;
  name: string;
}

interface Line {
  description: string;
  quantity: number;
  unitPrice: number;
  vatRate: number;
}

const emptyLine: Line = { description: "", quantity: 1, unitPrice: 0, vatRate: 21 };

export function InvoiceForm({ customers }: { customers: Customer[] }) {
  const t = useTranslations("invoices");
  const router = useRouter();
  const [customerId, setCustomerId] = useState(customers[0]?.id ?? "");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<Line[]>([{ ...emptyLine }]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateLine = (i: number, patch: Partial<Line>) =>
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));

  const subtotal = lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0);
  const vat = lines.reduce((s, l) => s + l.quantity * l.unitPrice * (l.vatRate / 100), 0);

  async function submit() {
    setSaving(true);
    setError(null);
    const res = await fetch("/api/invoices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customerId, notes, lineItems: lines }),
    });
    setSaving(false);
    if (!res.ok) {
      setError(t("saveError"));
      return;
    }
    router.push("/invoices");
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="max-w-sm">
        <label className="text-sm font-medium text-gray-700">{t("customer")}</label>
        <select
          value={customerId}
          onChange={(e) => setCustomerId(e.target.value)}
          className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
        >
          {customers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <h3 className="mb-2 font-semibold">{t("lineItems")}</h3>
        <div className="flex flex-col gap-2">
          {lines.map((line, i) => (
            <div key={i} className="flex gap-2">
              <Input
                placeholder={t("description")}
                className="flex-1"
                value={line.description}
                onChange={(e) => updateLine(i, { description: e.target.value })}
              />
              <Input
                type="number"
                className="w-20"
                value={line.quantity}
                onChange={(e) => updateLine(i, { quantity: Number(e.target.value) })}
              />
              <Input
                type="number"
                className="w-28"
                value={line.unitPrice}
                onChange={(e) => updateLine(i, { unitPrice: Number(e.target.value) })}
              />
              <Input
                type="number"
                className="w-20"
                value={line.vatRate}
                onChange={(e) => updateLine(i, { vatRate: Number(e.target.value) })}
              />
            </div>
          ))}
        </div>
        <Button
          variant="secondary"
          className="mt-2"
          onClick={() => setLines((prev) => [...prev, { ...emptyLine }])}
        >
          + {t("addLine")}
        </Button>
      </div>

      <textarea
        placeholder={t("notes")}
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
        rows={3}
      />

      <div className="text-right text-sm text-gray-600">
        <div>
          {t("subtotal")}: € {subtotal.toFixed(2)}
        </div>
        <div>
          {t("vat")}: € {vat.toFixed(2)}
        </div>
        <div className="font-semibold text-gray-900">
          {t("total")}: € {(subtotal + vat).toFixed(2)}
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div>
        <Button onClick={submit} disabled={saving || !customerId}>
          {saving ? "..." : t("new")}
        </Button>
      </div>
    </div>
  );
}
