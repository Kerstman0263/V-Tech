"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/ui/Icon";
import { parseReceipt, type ParsedReceipt } from "@/lib/ocr/parse-receipt";

/**
 * "Bonnetje scannen": leest bedrag, datum, btw en leverancier uit een foto.
 *
 * Standaard volledig LOKAAL in de browser (Tesseract.js, WebAssembly): geen
 * API-sleutel, geen kosten, en de foto verlaat het apparaat niet voordat de
 * gebruiker de uitgave opslaat. Is er server-side een clouddienst
 * geconfigureerd (OCR_PROVIDER), dan wordt die gebruikt — nauwkeuriger.
 */
export function ReceiptScanner({ image, onResult }: { image: string | null; onResult: (r: ParsedReceipt) => void }) {
  const t = useTranslations("expenses.ocr");
  const [status, setStatus] = useState<"idle" | "working" | "done" | "error">("idle");
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<ParsedReceipt | null>(null);
  const [cloud, setCloud] = useState(false);
  const lastImage = useRef<string | null>(null);

  useEffect(() => {
    fetch("/api/expenses/ocr")
      .then((r) => (r.ok ? r.json() : { provider: "none" }))
      .then((d: { provider?: string }) => setCloud(d.provider === "mindee"))
      .catch(() => {});
  }, []);

  // Nieuwe foto -> resultaat resetten
  useEffect(() => {
    if (image !== lastImage.current) {
      lastImage.current = image;
      setStatus("idle");
      setResult(null);
      setProgress(0);
    }
  }, [image]);

  async function scan() {
    if (!image) return;
    setStatus("working");
    setProgress(0);
    try {
      let parsed: ParsedReceipt;
      if (cloud) {
        const res = await fetch("/api/expenses/ocr", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ image }) });
        if (!res.ok) throw new Error("cloud");
        parsed = (await res.json()) as ParsedReceipt;
      } else {
        parsed = await recognizeLocally(image, setProgress);
      }
      setResult(parsed);
      setStatus("done");
      onResult(parsed);
    } catch (err) {
      console.error(err);
      setStatus("error");
    }
  }

  if (!image) return null;

  return (
    <div className="rounded-xl border border-brand-500/25 bg-brand-500/[0.06] p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm">
          <Icon name="zap" className="h-4 w-4 text-brand-300" />
          <span className="font-medium text-white">{t("title")}</span>
          <span className="text-xs text-slate-500">{cloud ? t("modeCloud") : t("modeLocal")}</span>
        </div>
        <button
          type="button"
          onClick={scan}
          disabled={status === "working"}
          className={cn(
            "rounded-lg px-3 py-1.5 text-xs font-semibold transition-all",
            status === "working" ? "bg-white/10 text-slate-400" : "bg-brand-600 text-white shadow-glow hover:bg-brand-500",
          )}
        >
          {status === "working" ? t("working", { pct: Math.round(progress * 100) }) : status === "done" ? t("again") : t("scan")}
        </button>
      </div>

      {status === "working" && (
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
          <div className="h-full rounded-full bg-gradient-to-r from-brand-500 to-fuchsia-400 transition-all duration-300" style={{ width: `${Math.max(4, progress * 100)}%` }} />
        </div>
      )}

      {status === "done" && result && (
        <p className="mt-2 text-xs text-slate-400">
          {result.confidence >= 0.75 ? t("doneGood") : result.confidence > 0 ? t("donePartial") : t("doneNothing")}
        </p>
      )}
      {status === "error" && <p className="mt-2 text-xs text-rose-400">{t("error")}</p>}
    </div>
  );
}

/** Foto verkleinen (snellere en vaak betere OCR) en lokaal herkennen. */
async function recognizeLocally(dataUrl: string, onProgress: (p: number) => void): Promise<ParsedReceipt> {
  const prepared = await downscale(dataUrl, 1600);
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("nld+eng", 1, {
    // Alles same-origin (public/): geen CDN, geen CSP-gedoe, werkt offline-ish
    workerPath: "/tesseract/worker.min.js",
    corePath: "/tesseract/",
    langPath: "/tessdata",
    gzip: false,
    logger: (m: { status?: string; progress?: number }) => {
      if (m.status === "recognizing text" && typeof m.progress === "number") onProgress(m.progress);
      else if (typeof m.progress === "number") onProgress(Math.min(0.15, m.progress * 0.15));
    },
  });
  try {
    const { data } = await worker.recognize(prepared);
    return parseReceipt(data.text ?? "");
  } finally {
    await worker.terminate();
  }
}

function downscale(dataUrl: string, max: number): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      if (scale === 1) return resolve(dataUrl);
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * scale);
      c.height = Math.round(img.height * scale);
      const ctx = c.getContext("2d");
      if (!ctx) return resolve(dataUrl);
      ctx.drawImage(img, 0, 0, c.width, c.height);
      resolve(c.toDataURL("image/jpeg", 0.92));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}
