"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/routing";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { Icon } from "@/components/ui/Icon";

type Status = "DRAFT" | "SENT" | "PAID" | "OVERDUE" | "CANCELED";
const STATUSES: Status[] = ["DRAFT", "SENT", "PAID", "OVERDUE", "CANCELED"];

export function InvoiceActions({ id, status, number, recipient, recipientEmail, totalLabel }: {
  id: string; status: Status; number: string; recipient: string; recipientEmail: string | null; totalLabel: string;
}) {
  const t = useTranslations("invoices");
  const tc = useTranslations("common");
  const router = useRouter();
  const review = useRef<HTMLDialogElement>(null);
  const locked = useRef(false);
  const [current, setCurrent] = useState<Status>(status);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [payUrl, setPayUrl] = useState<string | null>(null);

  async function act(path: string, method: string, body?: unknown): Promise<Record<string, unknown> | null> {
    if (locked.current) return null;
    locked.current = true;
    setBusy(true); setError(null); setMessage(null);
    try {
      const res = await fetch("/api/invoices/" + id + path, {
        method, ...(body !== undefined ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error === "no_email" ? t("reminderNoEmail") : data.error === "email_not_configured" ? t("emailNotConfigured") : t("actionFailed"));
        return null;
      }
      return data;
    } catch {
      setError(t("connectionFailed")); return null;
    } finally {
      locked.current = false; setBusy(false);
    }
  }

  async function sendInvoice() {
    const result = await act("/send", "POST", { confirmed: true });
    if (result) {
      review.current?.close(); setMessage(t("invoiceSent"));
      if (current === "DRAFT") setCurrent("SENT");
      router.refresh();
    }
  }

  async function changeStatus(next: Status) {
    if (await act("", "PATCH", { status: next })) {
      setCurrent(next); setMessage(t("actionSaved")); router.refresh();
    }
  }

  async function reminder() {
    if (!confirm(t("reminderConfirm"))) return;
    if (await act("/reminder", "POST")) { setMessage(t("reminderSent")); router.refresh(); }
  }

  async function createFromInvoice(credit: boolean) {
    if (credit && !confirm(t("creditConfirm"))) return;
    const data = await act(credit ? "/credit" : "/duplicate", "POST");
    if (typeof data?.id === "string") { router.push("/invoices/" + data.id); router.refresh(); }
  }

  async function remove() {
    if (!confirm(t("deleteConfirm"))) return;
    if (await act("", "DELETE")) { router.push("/invoices"); router.refresh(); }
  }

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-white/[0.06] bg-[#12112a]/60 p-5 backdrop-blur-md" aria-busy={busy}>
      <Select label={tc("status")} value={current} disabled={busy} onChange={(v) => changeStatus(v as Status)} options={STATUSES.filter((s) => s !== "DRAFT" || current === "DRAFT").map((s) => ({ value: s, label: t("status." + s.toLowerCase()) }))} />
      <a href={"/api/invoices/" + id + "/pdf"} className="rounded-lg bg-brand-600 px-4 py-3 text-center text-sm font-semibold text-white hover:bg-brand-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-300">
        {tc("download_pdf")}
      </a>
      {current !== "PAID" && current !== "CANCELED" && (
        <Button variant="secondary" className="w-full" disabled={busy} onClick={() => { setError(null); review.current?.showModal(); }}>
          <Icon name="send" className="mr-1 inline h-4 w-4" />{t("sendInvoice")}
        </Button>
      )}
      <Button variant="secondary" className="w-full" disabled={busy || current === "PAID" || current === "CANCELED"} onClick={async () => {
        const data = await act("/payment-link", "POST");
        if (typeof data?.checkoutUrl === "string") setPayUrl(data.checkoutUrl);
      }}><Icon name="wallet" className="mr-1 inline h-4 w-4" />{t("paymentLink")}</Button>
      {payUrl && <div className="rounded-lg bg-brand-500/10 p-3 text-sm"><p>{t("paymentLinkReady")}</p><a href={payUrl} target="_blank" rel="noreferrer" className="break-all text-brand-300 underline">{payUrl}</a></div>}
      {(current === "SENT" || current === "OVERDUE") && <Button variant="secondary" disabled={busy} onClick={reminder}><Icon name="mail" className="mr-1 inline h-4 w-4" />{t("sendReminder")}</Button>}
      <Button variant="secondary" disabled={busy} onClick={() => createFromInvoice(false)}>{t("duplicate")}</Button>
      {current !== "DRAFT" && current !== "CANCELED" && <Button variant="secondary" disabled={busy} onClick={() => createFromInvoice(true)}>{t("credit")}</Button>}
      {current === "DRAFT" && <button onClick={remove} disabled={busy} className="min-h-11 text-sm font-medium text-rose-300 hover:underline focus-visible:outline focus-visible:outline-2 disabled:opacity-50">{t("deleteInvoice")}</button>}
      {error && <p role="alert" className="rounded-xl border border-rose-400/30 bg-rose-400/10 p-3 text-sm text-rose-200">{error}</p>}
      {message && <p role="status" className="text-sm text-emerald-300">{message}</p>}

      <dialog ref={review} aria-labelledby="invoice-send-review" onCancel={(e) => { if (busy) e.preventDefault(); }} className="m-auto w-[calc(100%_-_2rem)] max-w-lg rounded-2xl border border-white/10 bg-[#12112a] p-6 text-slate-100 shadow-xl backdrop:bg-black/70">
        <h2 id="invoice-send-review" className="text-xl font-bold text-white">{t("sendReview.title")}</h2>
        <p className="mt-2 text-sm text-slate-300">{t("sendReview.description")}</p>
        <dl className="my-5 space-y-3 text-sm">
          <div><dt className="text-slate-400">{t("number")}</dt><dd className="font-medium">{number}</dd></div>
          <div><dt className="text-slate-400">{t("customer")}</dt><dd>{recipient}</dd><dd className="break-all">{recipientEmail ?? t("sendReview.noEmail")}</dd></div>
          <div><dt className="text-slate-400">{t("total")}</dt><dd className="text-lg font-semibold">{totalLabel}</dd></div>
        </dl>
        <a href={"/api/invoices/" + id + "/pdf?preview=1"} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center text-sm font-medium text-brand-300 underline">{t("sendReview.preview")}</a>
        <p className="mt-2 text-sm text-slate-400">{t("sendReview.linkNote")}</p>
        {error && <p role="alert" className="mt-4 text-sm text-rose-200">{error}</p>}
        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <Button variant="secondary" disabled={busy} onClick={() => review.current?.close()}>{t("sendReview.back")}</Button>
          <Button disabled={busy || !recipientEmail} onClick={sendInvoice}>{busy ? t("sendReview.sending") : t("sendReview.confirm")}</Button>
        </div>
      </dialog>
    </div>
  );
}
