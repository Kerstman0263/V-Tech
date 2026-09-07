"use client";
import { Icon } from "@/components/ui/Icon";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { Link } from "@/i18n/routing";
import { formatTime, formatDateLabel } from "@/lib/utils";

interface Message {
  id: string;
  senderRole: "USER" | "ADMIN";
  body: string;
  createdAt: string;
  optimistic?: boolean;
}

// Groepeer berichten per dag voor datum-scheidingslijnen.
function groupByDay(messages: Message[]) {
  const groups: { day: string; items: Message[] }[] = [];
  for (const m of messages) {
    const day = m.createdAt.slice(0, 10);
    const last = groups[groups.length - 1];
    if (last && last.day === day) last.items.push(m);
    else groups.push({ day, items: [m] });
  }
  return groups;
}

export function SupportWidget({ isPaid }: { isPaid: boolean }) {
  const t = useTranslations("support");
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [unread, setUnread] = useState(0);
  const [status, setStatus] = useState("OPEN");
  const [seen, setSeen] = useState(false);
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    if (!isPaid || (typeof document !== "undefined" && document.hidden)) return;
    const res = await fetch("/api/support");
    if (!res.ok) return;
    const data = await res.json();
    setMessages((prev) => {
      // Behoud optimistische berichten die nog niet terug zijn van de server
      const optimistic = prev.filter((m) => m.optimistic);
      return [...data.messages, ...optimistic.filter((o) => !data.messages.some((s: Message) => s.body === o.body && s.senderRole === "USER"))];
    });
    setUnread(data.unread ?? 0);
    setStatus(data.status ?? "OPEN");
    setSeen(data.seen ?? false);
  }, [isPaid]);

  // Adaptieve polling: snel (2,5s) wanneer zichtbaar, slaat over wanneer verborgen
  useEffect(() => {
    if (!isPaid) return;
    load();
    const id = setInterval(load, 2500);
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      clearInterval(id);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [isPaid, load]);

  useEffect(() => {
    if (open && isPaid) {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
      if (unread > 0) fetch("/api/support/read", { method: "POST" }).then(() => setUnread(0));
    }
  }, [open, messages, isPaid, unread]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const body = draft.trim();
    if (!body) return;
    setDraft("");
    // Optimistisch: toon direct
    setMessages((prev) => [
      ...prev,
      { id: `temp-${prev.length}`, senderRole: "USER", body, createdAt: new Date().toISOString(), optimistic: true },
    ]);
    const res = await fetch("/api/support", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body }),
    });
    if (res.ok) load();
  }

  const groups = groupByDay(messages);

  return (
    <div className="fixed bottom-24 right-5 z-[71] md:bottom-5">
      {open && (
        <div className="mb-3 flex h-[30rem] w-80 flex-col overflow-hidden rounded-2xl border border-white/[0.06] bg-[#12112a]/80 backdrop-blur-md shadow-2xl sm:w-96">
          <div className="flex items-center justify-between bg-gradient-to-r from-brand-600 to-brand-800 px-4 py-3 text-white">
            <div>
              <p className="text-sm font-semibold">{t("title")}</p>
              <p className="text-xs text-brand-100">
                {isPaid ? (status === "RESOLVED" ? t("status.resolved") : t("subtitle")) : t("subtitle")}
              </p>
            </div>
            <button onClick={() => setOpen(false)} aria-label="x" className="text-white/80 hover:text-white">✕</button>
          </div>

          {isPaid ? (
            <>
              <div ref={scrollRef} className="flex-1 space-y-1 overflow-y-auto bg-white/[0.03] p-3">
                {messages.length === 0 ? (
                  <p className="mt-6 text-center text-sm text-slate-500">{t("empty")}</p>
                ) : (
                  groups.map((g) => (
                    <div key={g.day} className="space-y-1">
                      <div className="my-2 flex justify-center">
                        <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-medium text-slate-400">
                          {formatDateLabel(g.day, locale)}
                        </span>
                      </div>
                      {g.items.map((m) => (
                        <div key={m.id} className={m.senderRole === "USER" ? "flex flex-col items-end" : "flex flex-col items-start"}>
                          <div
                            className={
                              m.senderRole === "USER"
                                ? "max-w-[80%] rounded-2xl rounded-br-sm bg-brand-600 px-3 py-2 text-sm text-white"
                                : "max-w-[80%] rounded-2xl rounded-bl-sm bg-white/[0.08] px-3 py-2 text-sm text-slate-200 ring-1 ring-white/10"
                            }
                          >
                            {m.senderRole === "ADMIN" && (
                              <span className="mb-0.5 block text-[10px] font-semibold uppercase text-brand-400">{t("adminLabel")}</span>
                            )}
                            {m.body}
                          </div>
                          <span className="mt-0.5 px-1 text-[10px] text-slate-500">{formatTime(m.createdAt, locale)}</span>
                        </div>
                      ))}
                    </div>
                  ))
                )}
                {seen && messages.length > 0 && (
                  <p className="pr-1 text-right text-[10px] font-medium text-slate-500">{t("seen")}</p>
                )}
              </div>
              <form onSubmit={send} className="flex items-center gap-2 border-t border-white/[0.06] p-2">
                <input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder={t("placeholder")}
                  className="flex-1 rounded-lg border border-white/10 px-3 py-2 text-sm bg-white/[0.03] text-white placeholder-slate-500 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
                />
                <button type="submit" disabled={!draft.trim()} className="rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50">➤</button>
              </form>
            </>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-white/5 text-slate-400"><Icon name="lock" className="h-6 w-6" /></div>
              <p className="text-sm text-slate-400">{t("upgrade")}</p>
              <Link href="/settings" className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700">{t("upgradeCta")}</Link>
            </div>
          )}
        </div>
      )}

      <button
        onClick={() => setOpen((o) => !o)}
        className="relative flex h-14 w-14 items-center justify-center rounded-full bg-brand-600 text-2xl text-white shadow-lg transition-transform hover:scale-105 hover:bg-brand-700"
        aria-label={t("title")}
      >
        {open ? "✕" : <Icon name="chat" className="h-5 w-5" />}
        {!open && unread > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1 text-xs font-bold text-white">{unread}</span>
        )}
      </button>
    </div>
  );
}
