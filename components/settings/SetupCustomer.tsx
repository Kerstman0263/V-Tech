"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/routing";
import { CustomerImport } from "@/components/customers/CustomerImport";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

export function SetupCustomer({ switching }: { switching: boolean }) {
  const t = useTranslations("setup.welcome");
  const router = useRouter();
  const locked = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");

  return <div className="mt-5 space-y-5">
    {switching && <div className="space-y-3 rounded-xl border border-brand-500/20 bg-brand-500/5 p-4">
      <p className="text-sm text-slate-300">{t("importHint")}</p>
      <div className="flex flex-wrap items-center gap-3">
        <CustomerImport onImported={() => router.refresh()} />
        <a href="/templates/klanten.csv" download className="text-sm text-brand-300 underline">{t("template")}</a>
      </div>
    </div>}
    <details open={!switching}>
      <summary className="cursor-pointer font-medium text-white">{t("manualCustomer")}</summary>
      {saved ? <p role="status" className="mt-4 text-sm text-emerald-300">{t("customerSaved")}</p> : <form className="mt-4 flex max-w-lg flex-col gap-3" onSubmit={async (event) => {
        event.preventDefault();
        if (locked.current || !name.trim()) return;
        locked.current = true;
        setBusy(true);
        setError("");
        try {
          const res = await fetch("/api/customers", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: name.trim(), email: email.trim() }),
          });
          if (!res.ok) throw new Error();
          setSaved(true);
          router.refresh();
        } catch {
          setError(t("customerError"));
        } finally {
          locked.current = false;
          setBusy(false);
        }
      }}>
        <Input label={t("customerName")} required maxLength={200} autoComplete="organization" value={name} onChange={(event) => setName(event.target.value)} />
        <Input label={t("customerEmail")} type="email" maxLength={320} autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} />
        <p className="text-xs text-slate-400">{t("customerHint")}</p>
        {error && <p role="alert" className="text-sm text-rose-300">{error}</p>}
        <div><Button type="submit" disabled={busy || !name.trim()}>{busy ? "…" : t("saveCustomer")}</Button></div>
      </form>}
    </details>
    <Link href="/customers" className="inline-flex text-sm text-brand-300 underline">{t("manageCustomers")} →</Link>
  </div>;
}
