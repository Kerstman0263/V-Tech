"use client";
import { Icon } from "@/components/ui/Icon";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Confetti } from "@/components/ui/Confetti";

type Status = "DRAFT" | "SENT" | "ACCEPTED" | "DECLINED" | "EXPIRED" | "CONVERTED";
interface Deposit { invoiceNumber: string; amount: number; checkoutUrl: string | null }

/**
 * Publieke accepteer/afwijs-flow voor de klant (geen login).
 * Accepteren = digitaal ondertekenen: naam + getekende handtekening.
 * Met aanbetaling: na ondertekenen direct door naar iDEAL (Mollie) of, zolang
 * dat nog niet actief is, een gemailde aanbetalingsfactuur.
 */
export function QuoteRespond({ token, initialStatus, depositPercent = 0, depositAmount = 0, money }: {
  token: string; initialStatus: Status; depositPercent?: number; depositAmount?: number; money?: (n: number) => string;
}) {
  const t = useTranslations("quotes");
  const [status, setStatus] = useState<Status>(initialStatus);
  const [busy, setBusy] = useState(false);
  const [celebrate, setCelebrate] = useState(false);
  const [declining, setDeclining] = useState(false);
  const [signing, setSigning] = useState(false);
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState(false);
  const [name, setName] = useState("");
  const [agree, setAgree] = useState(false);
  const [hasInk, setHasInk] = useState(false);
  const [signError, setSignError] = useState<string | null>(null);
  const [deposit, setDeposit] = useState<Deposit | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const fmt = money ?? ((n: number) => `€ ${n.toFixed(2)}`);

  // Canvas scherp maken op high-dpi schermen
  useEffect(() => {
    const c = canvasRef.current;
    if (!c || !signing) return;
    const ratio = window.devicePixelRatio || 1;
    const w = c.clientWidth, h = 160;
    c.width = w * ratio; c.height = h * ratio;
    const ctx = c.getContext("2d")!;
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2.2; ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.strokeStyle = "#ffffff";
  }, [signing]);

  const pos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  function down(e: React.PointerEvent<HTMLCanvasElement>) {
    drawing.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    const ctx = e.currentTarget.getContext("2d")!;
    const p = pos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y);
  }
  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const ctx = e.currentTarget.getContext("2d")!;
    const p = pos(e); ctx.lineTo(p.x, p.y); ctx.stroke();
    if (!hasInk) setHasInk(true);
  }
  function up() { drawing.current = false; }
  function clear() {
    const c = canvasRef.current; if (!c) return;
    const ctx = c.getContext("2d")!; ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, c.width, c.height); ctx.restore();
    setHasInk(false);
  }

  async function respond(action: "accept" | "decline", extra: Record<string, unknown> = {}) {
    setBusy(true);
    const res = await fetch(`/api/public/quotes/${token}/respond`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...extra }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    const next = (data.status as Status) ?? status;
    if (res.ok || data.status) setStatus(next);
    if (action === "accept" && (res.ok || next === "ACCEPTED")) {
      setSigning(false);
      if (data.deposit) setDeposit(data.deposit as Deposit);
      // Aanbetaling via iDEAL: meteen door naar Mollie
      if (data.deposit?.checkoutUrl) { window.location.href = data.deposit.checkoutUrl; return; }
      setCelebrate(true);
      setTimeout(() => setCelebrate(false), 5000);
    }
  }

  function submitSign() {
    if (name.trim().length < 2) return setSignError(t("signNameRequired"));
    if (!hasInk) return setSignError(t("signDrawRequired"));
    if (!agree) return setSignError(t("signAgreeRequired"));
    setSignError(null);
    const signatureData = canvasRef.current?.toDataURL("image/png") ?? "";
    respond("accept", { signatureName: name.trim(), signatureData });
  }

  function submitDecline() {
    if (reason.trim().length === 0) { setReasonError(true); return; }
    respond("decline", { reason: reason.trim() });
  }

  if (status === "ACCEPTED" || status === "CONVERTED") {
    return (
      <>
        {celebrate && <Confetti />}
        <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-6 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-400"><Icon name="check-circle" className="h-6 w-6" /></div>
          <p className="mt-2 font-semibold text-emerald-200">{t("publicAccepted")}</p>
          {deposit && (
            <p className="mt-2 text-sm text-emerald-100/80">
              {t("depositInvoiceSent", { number: deposit.invoiceNumber, amount: fmt(deposit.amount) })}
              {deposit.checkoutUrl && <> <a href={deposit.checkoutUrl} className="font-semibold underline">{t("depositPayNow")}</a></>}
            </p>
          )}
        </div>
      </>
    );
  }
  if (status === "DECLINED") {
    return (
      <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 p-6 text-center">
        <p className="font-semibold text-rose-200">{t("publicDeclined")}</p>
      </div>
    );
  }
  if (status === "EXPIRED") {
    return <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-6 text-center text-slate-300">{t("publicExpired")}</div>;
  }

  if (declining) {
    return (
      <div className="flex flex-col gap-3 rounded-2xl border border-white/[0.06] bg-[#12112a]/60 backdrop-blur-md p-6">
        <label className="text-sm font-medium text-slate-300">{t("declineReasonLabel")}</label>
        <textarea
          value={reason}
          onChange={(e) => { setReason(e.target.value); setReasonError(false); }}
          rows={3}
          placeholder={t("declineReasonPlaceholder")}
          className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white placeholder-slate-500 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
        />
        {reasonError && <p className="text-sm text-rose-400">{t("declineReasonRequired")}</p>}
        <div className="flex flex-wrap gap-2">
          <button onClick={submitDecline} disabled={busy} className="rounded-lg bg-rose-600 px-5 py-2.5 font-semibold text-white hover:bg-rose-700 disabled:opacity-50">{t("declineConfirm")}</button>
          <button onClick={() => { setDeclining(false); setReason(""); setReasonError(false); }} disabled={busy} className="rounded-lg border border-white/10 px-5 py-2.5 font-semibold text-slate-300 hover:bg-white/[0.03]">{t("declineBack")}</button>
        </div>
      </div>
    );
  }

  // Digitaal ondertekenen
  if (signing) {
    return (
      <div className="flex flex-col gap-4 rounded-2xl border border-emerald-500/20 bg-[#12112a]/70 backdrop-blur-md p-6">
        <div>
          <h3 className="font-semibold text-white">{t("signTitle")}</h3>
          <p className="text-sm text-slate-400">{t("signSub")}</p>
        </div>
        <label className="flex flex-col gap-1 text-sm font-medium text-slate-300">
          {t("signName")}
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("signNamePlaceholder")} autoComplete="name"
            className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-white placeholder-slate-500 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20" />
        </label>
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between text-sm font-medium text-slate-300">
            <span>{t("signDraw")}</span>
            <button type="button" onClick={clear} className="text-xs font-medium text-slate-500 hover:text-white">{t("signClear")}</button>
          </div>
          <canvas
            ref={canvasRef}
            onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={up}
            className="h-40 w-full cursor-crosshair touch-none rounded-xl border border-dashed border-white/20 bg-white/[0.03]"
            aria-label={t("signDraw")}
          />
        </div>
        <label className="flex items-start gap-2 text-sm text-slate-300">
          <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-1 h-4 w-4 accent-emerald-500" />
          <span>{t("signAgree")}</span>
        </label>
        {depositPercent > 0 && (
          <p className="rounded-lg border border-brand-500/20 bg-brand-500/10 px-3 py-2 text-sm text-brand-100">
            {t("depositNote", { percent: depositPercent, amount: fmt(depositAmount) })}
          </p>
        )}
        {signError && <p className="text-sm text-rose-400">{signError}</p>}
        <div className="flex flex-wrap gap-2">
          <button onClick={submitSign} disabled={busy} className="rounded-xl bg-emerald-600 px-7 py-3 font-semibold text-white shadow-[0_0_20px_rgba(16,185,129,0.35)] transition-all hover:bg-emerald-500 disabled:opacity-50">
            {busy ? "…" : depositPercent > 0 ? t("signConfirmDeposit") : t("signConfirm")}
          </button>
          <button onClick={() => setSigning(false)} disabled={busy} className="rounded-lg border border-white/10 px-5 py-3 font-semibold text-slate-300 hover:bg-white/[0.03]">{t("declineBack")}</button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-white/[0.06] bg-[#12112a]/60 backdrop-blur-md p-6">
      {depositPercent > 0 && (
        <p className="text-center text-sm text-slate-400">{t("depositNote", { percent: depositPercent, amount: fmt(depositAmount) })}</p>
      )}
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
        <button
          onClick={() => setSigning(true)}
          disabled={busy}
          className="rounded-xl bg-emerald-600 px-7 py-3 font-semibold text-white shadow-[0_0_20px_rgba(16,185,129,0.35)] transition-all hover:bg-emerald-500 disabled:opacity-50"
        >
          <Icon name="check" className="mr-1 inline h-4 w-4 align-[-2px]" />{t("publicAccept")}
        </button>
        <button onClick={() => setDeclining(true)} disabled={busy} className="rounded-lg border border-white/10 px-6 py-3 font-semibold text-slate-300 hover:bg-white/[0.03] disabled:opacity-50">
          {t("publicDecline")}
        </button>
      </div>
    </div>
  );
}
