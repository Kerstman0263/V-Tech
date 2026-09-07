"use client";
import { Icon } from "@/components/ui/Icon";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/routing";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";

type Status = "DRAFT" | "SENT" | "ACCEPTED" | "DECLINED" | "EXPIRED" | "CONVERTED";
const STATUSES: Status[] = ["DRAFT", "SENT", "ACCEPTED", "DECLINED", "EXPIRED", "CONVERTED"];

export function QuoteActions({
  id,
  status,
  publicToken,
  convertedInvoiceId,
}: {
  id: string;
  status: Status;
  publicToken: string;
  convertedInvoiceId: string | null;
}) {
  const t = useTranslations("quotes");
  const tc = useTranslations("common");
  const ti = useTranslations("invoices");
  const router = useRouter();
  const [current, setCurrent] = useState<Status>(status);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const publicUrl = typeof window !== "undefined" ? `${window.location.origin}/quote/${publicToken}` : `/quote/${publicToken}`;

  async function changeStatus(next: Status) {
    setBusy(true);
    setCurrent(next);
    await fetch(`/api/quotes/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: next }) });
    setBusy(false);
    router.refresh();
  }

  async function send() {
    setBusy(true);
    setMsg(null);
    const res = await fetch(`/api/quotes/${id}/send`, { method: "POST" });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok) {
      setCurrent("SENT");
      setMsg(data.emailed ? t("sentEmailed") : data.reason === "email_not_configured" ? t("emailNotConfigured") : t("sentNoEmail"));
      router.refresh();
    }
  }

  async function convert() {
    setBusy(true);
    const res = await fetch(`/api/quotes/${id}/convert`, { method: "POST" });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (data.invoiceId) {
      router.push(`/invoices/${data.invoiceId}`);
      router.refresh();
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  }

  async function remove() {
    if (!confirm(t("deleteConfirm"))) return;
    setBusy(true);
    await fetch(`/api/quotes/${id}`, { method: "DELETE" });
    router.push("/quotes");
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-white/[0.06] bg-[#12112a]/60 backdrop-blur-md p-5">
      <Select
        label={tc("status")}
        value={current}
        disabled={busy}
        onChange={(v) => changeStatus(v as Status)}
        options={STATUSES.map((s) => ({ value: s, label: t(`status.${s.toLowerCase()}`) }))}
      />

      <a href={`/api/quotes/${id}/pdf`} className="rounded-lg bg-brand-600 px-4 py-2 text-center text-sm font-semibold text-white hover:bg-brand-700">
        ↓ {tc("download_pdf")}
      </a>

      <Button variant="secondary" className="w-full" disabled={busy} onClick={send}>
        <Icon name="mail" className="mr-1 inline h-4 w-4 align-[-2px]" />{t("send")}
      </Button>
      {msg && <p className="text-xs text-slate-400">{msg}</p>}

      {/* Publieke link */}
      <div>
        <label className="text-sm font-medium text-slate-300">{t("publicLink")}</label>
        <div className="mt-1 flex items-center gap-2">
          <input readOnly value={publicUrl} className="min-w-0 flex-1 truncate rounded-lg border border-white/10 bg-white/[0.03] px-2 py-1.5 text-xs text-slate-400" />
          <button onClick={copyLink} className="shrink-0 rounded-lg border border-white/10 px-2 py-1.5 text-xs font-medium text-slate-300 hover:bg-white/[0.03]">
            {copied ? t("linkCopied") : t("copy")}
          </button>
        </div>
      </div>

      {/* Omzetten naar factuur */}
      {convertedInvoiceId ? (
        <a href={`/invoices/${convertedInvoiceId}`} className="rounded-lg bg-emerald-500/10 px-4 py-2 text-center text-sm font-semibold text-emerald-300 hover:bg-emerald-500/20">
          {t("viewInvoice")} →
        </a>
      ) : (
        <Button className="w-full" disabled={busy} onClick={convert}>
          <Icon name="receipt" className="mr-1 inline h-4 w-4 align-[-2px]" />{t("convert")}
        </Button>
      )}

      <button onClick={remove} disabled={busy} className="text-sm font-medium text-rose-400 hover:underline disabled:opacity-50">
        {t("deleteQuote")}
      </button>
    </div>
  );
}
