"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { cn, formatTime } from "@/lib/utils";

type Status = "OPEN" | "PENDING" | "RESOLVED";

interface Thread {
  userId: string;
  name: string;
  email: string;
  status: Status;
  lastMessage: string;
  unread: number;
}

interface Message {
  id: string;
  senderRole: "USER" | "ADMIN";
  body: string;
  createdAt: string;
}

const statusStyles: Record<Status, string> = {
  OPEN: "bg-rose-500/15 text-rose-300",
  PENDING: "bg-amber-500/15 text-amber-300",
  RESOLVED: "bg-emerald-500/15 text-emerald-300",
};

export function SupportInbox() {
  const t = useTranslations("support");
  const tc = useTranslations("common");
  const locale = useLocale();
  const [threads, setThreads] = useState<Thread[]>([]);
  const [filter, setFilter] = useState<"ALL" | "OPEN" | "RESOLVED">("ALL");
  const [active, setActive] = useState<string | null>(null);
  const [activeStatus, setActiveStatus] = useState<Status>("OPEN");
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const loadThreads = useCallback(async () => {
    const res = await fetch("/api/admin/support");
    if (res.ok) setThreads(await res.json());
  }, []);

  const loadMessages = useCallback(async (userId: string) => {
    const res = await fetch(`/api/admin/support/${userId}`);
    if (res.ok) {
      const data = await res.json();
      setMessages(data.messages);
      setActiveStatus(data.status);
      loadThreads();
    }
  }, [loadThreads]);

  useEffect(() => {
    loadThreads();
    const id = setInterval(loadThreads, 6000);
    return () => clearInterval(id);
  }, [loadThreads]);

  useEffect(() => {
    if (!active) return;
    loadMessages(active);
    const id = setInterval(() => loadMessages(active), 4000);
    return () => clearInterval(id);
  }, [active, loadMessages]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  async function reply(e: React.FormEvent) {
    e.preventDefault();
    if (!active || !draft.trim()) return;
    const body = draft;
    setDraft("");
    const res = await fetch(`/api/admin/support/${active}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body }),
    });
    if (res.ok) loadMessages(active);
  }

  async function setStatus(status: Status) {
    if (!active) return;
    await fetch(`/api/admin/support/${active}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    setActiveStatus(status);
    loadThreads();
  }

  const visible = threads.filter((th) =>
    filter === "ALL" ? true : filter === "OPEN" ? th.status !== "RESOLVED" : th.status === "RESOLVED",
  );

  return (
    <div className="grid h-[72vh] grid-cols-1 overflow-hidden rounded-2xl border border-white/[0.06] bg-[#12112a]/60 backdrop-blur-md md:h-[34rem] md:grid-cols-3">
      {/* Lijst + filters — op mobiel verborgen zodra een gesprek open is */}
      <div className={cn("flex-col border-r border-white/[0.06] md:col-span-1 md:flex", active ? "hidden" : "flex")}>
        <div className="flex gap-1 border-b border-white/[0.06] p-2">
          {(["ALL", "OPEN", "RESOLVED"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                "flex-1 rounded-md px-2 py-1 text-xs font-medium",
                filter === f ? "bg-brand-600 text-white" : "text-slate-400 hover:bg-white/10",
              )}
            >
              {t(`filter.${f.toLowerCase()}`)}
            </button>
          ))}
        </div>
        <div className="flex-1 overflow-y-auto">
          {visible.length === 0 ? (
            <p className="p-4 text-sm text-slate-500">{t("noThreads")}</p>
          ) : (
            visible.map((th) => (
              <button
                key={th.userId}
                onClick={() => setActive(th.userId)}
                className={cn(
                  "flex w-full flex-col gap-1 border-b border-white/[0.04] px-4 py-3 text-left hover:bg-white/[0.03]",
                  active === th.userId && "bg-brand-500/15",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium text-white">{th.name}</span>
                  {th.unread > 0 && (
                    <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1 text-xs font-bold text-white">{th.unread}</span>
                  )}
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-xs text-slate-400">{th.lastMessage}</span>
                  <span className={cn("shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium", statusStyles[th.status])}>
                    {t(`status.${th.status.toLowerCase()}`)}
                  </span>
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Gesprek — op mobiel alleen zichtbaar als er een gesprek gekozen is */}
      <div className={cn("flex-col md:col-span-2 md:flex", active ? "flex" : "hidden md:flex")}>
        {active ? (
          <>
            <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-2">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setActive(null)}
                  className="flex items-center text-sm font-medium text-slate-400 hover:text-white md:hidden"
                  aria-label={tc("back")}
                >
                  ← {tc("back")}
                </button>
                <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", statusStyles[activeStatus])}>
                  {t(`status.${activeStatus.toLowerCase()}`)}
                </span>
              </div>
              {activeStatus === "RESOLVED" ? (
                <button onClick={() => setStatus("OPEN")} className="text-xs font-medium text-brand-400 hover:underline">{t("reopen")}</button>
              ) : (
                <button onClick={() => setStatus("RESOLVED")} className="text-xs font-medium text-emerald-400 hover:underline">{t("markResolved")}</button>
              )}
            </div>
            <div ref={scrollRef} className="flex-1 space-y-1 overflow-y-auto bg-white/[0.03] p-4">
              {messages.map((m) => (
                <div key={m.id} className={m.senderRole === "ADMIN" ? "flex flex-col items-end" : "flex flex-col items-start"}>
                  <div
                    className={
                      m.senderRole === "ADMIN"
                        ? "max-w-[75%] rounded-2xl rounded-br-sm bg-brand-600 px-3 py-2 text-sm text-white"
                        : "max-w-[75%] rounded-2xl rounded-bl-sm bg-white/[0.08] px-3 py-2 text-sm text-slate-200 ring-1 ring-white/10"
                    }
                  >
                    {m.body}
                  </div>
                  <span className="mt-0.5 px-1 text-[10px] text-slate-500">{formatTime(m.createdAt, locale)}</span>
                </div>
              ))}
            </div>
            <form onSubmit={reply} className="flex items-center gap-2 border-t border-white/[0.06] p-3">
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder={t("replyPlaceholder")}
                className="flex-1 rounded-lg border border-white/10 px-3 py-2 text-sm bg-white/[0.03] text-white placeholder-slate-500 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
              />
              <button type="submit" disabled={!draft.trim()} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50">{t("sendReply")}</button>
            </form>
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center text-sm text-slate-500">{t("selectThread")}</div>
        )}
      </div>
    </div>
  );
}
