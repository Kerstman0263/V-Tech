"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { StatCard } from "@/components/ui/StatCard";
import { Select } from "@/components/ui/Select";
import { Icon, type IconName } from "@/components/ui/Icon";

// Haalt een leesbare foutmelding uit een API-response (voor formulieren).
async function apiError(res: Response): Promise<string> {
  const data = await res.json().catch(() => null);
  const issue = data?.issues?.fieldErrors ? Object.values(data.issues.fieldErrors).flat()[0] : null;
  return String(issue ?? data?.error ?? "Opslaan mislukt. Controleer je invoer en probeer het opnieuw.");
}

// Nette metadata-chip met icoon
function Chip({ icon, children, className }: { icon: IconName; children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-md bg-white/5 px-1.5 py-0.5 text-[11px] font-medium text-slate-400", className)}>
      <Icon name={icon} className="h-3 w-3" />
      {children}
    </span>
  );
}

type Status = "TODO" | "IN_PROGRESS" | "DONE";
type Priority = "LOW" | "NORMAL" | "HIGH" | "URGENT";

interface Option { id: string; name: string }

interface Task {
  id: string;
  title: string;
  description: string | null;
  assignedToId: string | null;
  assignedToName: string | null;
  dueDate: string | null;
  status: Status;
  priority: Priority;
  hours: number | null;
  projectId: string | null;
  customerId: string | null;
  projectName: string | null;
  customerName: string | null;
}

const todayStr = () => new Date().toISOString().slice(0, 10);

const PRIORITY_WEIGHT: Record<Priority, number> = { URGENT: 0, HIGH: 1, NORMAL: 2, LOW: 3 };
const PRIORITY_STYLE: Record<Priority, string> = {
  URGENT: "bg-rose-500/15 text-rose-300",
  HIGH: "bg-amber-500/15 text-amber-300",
  NORMAL: "bg-white/5 text-slate-400",
  LOW: "bg-white/5 text-slate-500",
};

const COLUMNS: { status: Status; accent: string }[] = [
  { status: "TODO", accent: "border-t-brand-500" },
  { status: "IN_PROGRESS", accent: "border-t-amber-500" },
  { status: "DONE", accent: "border-t-emerald-500" },
];

export function TaskManager({
  teamOptions,
  currentUserId,
  canSeeAll = false,
  fixedAssigneeId,
  projectOptions = [],
  customerOptions = [],
}: {
  teamOptions: Option[];
  currentUserId: string;
  canSeeAll?: boolean;
  fixedAssigneeId?: string;
  projectOptions?: Option[];
  customerOptions?: Option[];
}) {
  const t = useTranslations("tasks");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [scope, setScope] = useState<"me" | "all">(canSeeAll && !fixedAssigneeId ? "all" : "me");
  const [query, setQuery] = useState("");
  const [prioFilter, setPrioFilter] = useState<"ALL" | Priority>("ALL");
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [dragOver, setDragOver] = useState<Status | null>(null);
  // Custom "taak afronden"-modal (vervangt de native window.prompt)
  const [completing, setCompleting] = useState<Task | null>(null);
  const [completeHours, setCompleteHours] = useState("0");
  // Custom verwijder-bevestiging (vervangt de native window.confirm)
  const [removing, setRemoving] = useState<Task | null>(null);

  const emptyForm = {
    title: "",
    description: "",
    assignedToId: fixedAssigneeId ?? currentUserId,
    dueDate: "",
    hours: 0,
    priority: "NORMAL" as Priority,
    projectId: "",
    customerId: "",
  };
  const [form, setForm] = useState(emptyForm);

  const load = useCallback(async () => {
    const q = fixedAssigneeId ? `?assignedTo=${fixedAssigneeId}` : scope === "me" ? "?assignedTo=me" : "";
    const res = await fetch(`/api/tasks${q}`);
    if (res.ok) setTasks(await res.json());
  }, [scope, fixedAssigneeId]);
  useEffect(() => { load(); }, [load]);

  function startAdd() {
    setEditingId(null);
    setForm(emptyForm);
    setOpen(true);
  }
  function startEdit(task: Task) {
    setEditingId(task.id);
    setForm({
      title: task.title,
      description: task.description ?? "",
      assignedToId: task.assignedToId ?? fixedAssigneeId ?? currentUserId,
      dueDate: task.dueDate ? task.dueDate.slice(0, 10) : "",
      hours: task.hours ?? 0,
      priority: task.priority ?? "NORMAL",
      projectId: task.projectId ?? "",
      customerId: task.customerId ?? "",
    });
    setOpen(true);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const body = {
      title: form.title,
      description: form.description || null,
      assignedToId: form.assignedToId || null,
      dueDate: form.dueDate || null,
      priority: form.priority,
      projectId: form.projectId || null,
      customerId: form.customerId || null,
      hours: form.hours ? Number(form.hours) : undefined,
    };
    const res = await fetch(editingId ? `/api/tasks/${editingId}` : "/api/tasks", {
      method: editingId ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setSaving(false);
    if (!res.ok) {
      alert(await apiError(res));
      return;
    }
    setForm(emptyForm);
    setEditingId(null);
    setOpen(false);
    load();
  }

  async function setStatus(task: Task, status: Status) {
    if (status === task.status) return;
    if (status === "DONE") return complete(task);
    // Optimistisch verplaatsen zodat het bord direct reageert
    setTasks((prev) => prev.map((x) => (x.id === task.id ? { ...x, status } : x)));
    const res = await fetch(`/api/tasks/${task.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (!res.ok) alert(await apiError(res));
    load();
  }

  // Opent de custom modal i.p.v. de native prompt.
  function complete(task: Task) {
    setCompleteHours(String(task.hours ?? 0));
    setCompleting(task);
  }

  async function confirmComplete() {
    const task = completing;
    if (!task) return;
    const hours = Math.max(0, Number(completeHours) || 0);
    setCompleting(null);
    setTasks((prev) => prev.map((x) => (x.id === task.id ? { ...x, status: "DONE" } : x)));
    await fetch(`/api/tasks/${task.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "DONE", hours, logHours: hours > 0 }),
    });
    load();
  }

  async function confirmRemove() {
    const task = removing;
    if (!task) return;
    setRemoving(null);
    setTasks((prev) => prev.filter((x) => x.id !== task.id));
    await fetch(`/api/tasks/${task.id}`, { method: "DELETE" });
    load();
  }

  const today = todayStr();
  const isOverdue = (task: Task) => task.status !== "DONE" && task.dueDate != null && task.dueDate.slice(0, 10) < today;

  // Zoeken + prioriteitsfilter over alle kolommen
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return tasks.filter((x) => {
      if (prioFilter !== "ALL" && x.priority !== prioFilter) return false;
      if (!q) return true;
      return `${x.title} ${x.description ?? ""} ${x.assignedToName ?? ""} ${x.projectName ?? ""} ${x.customerName ?? ""}`
        .toLowerCase()
        .includes(q);
    });
  }, [tasks, query, prioFilter]);

  // Binnen een kolom: verlopen eerst, dan prioriteit, dan deadline
  const byUrgency = (a: Task, b: Task) => {
    const oa = isOverdue(a) ? 0 : 1;
    const ob = isOverdue(b) ? 0 : 1;
    if (oa !== ob) return oa - ob;
    if (PRIORITY_WEIGHT[a.priority] !== PRIORITY_WEIGHT[b.priority]) {
      return PRIORITY_WEIGHT[a.priority] - PRIORITY_WEIGHT[b.priority];
    }
    return (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999");
  };
  const byColumn = (status: Status) => filtered.filter((x) => x.status === status).sort(byUrgency);

  const overdueCount = filtered.filter(isOverdue).length;

  const card = (task: Task) => {
    const overdue = isOverdue(task);
    return (
      <div
        key={task.id}
        draggable
        onDragStart={(e) => e.dataTransfer.setData("text/task-id", task.id)}
        className={cn(
          "cursor-grab rounded-xl border border-white/[0.06] bg-[#12112a]/60 backdrop-blur-md p-3 shadow-sm transition-shadow hover:shadow-md active:cursor-grabbing",
          task.status === "DONE" && "opacity-70",
        )}
      >
        <div className="flex items-start justify-between gap-2">
          <p className={cn("text-sm font-semibold text-white", task.status === "DONE" && "text-slate-500 line-through")}>{task.title}</p>
          <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide", PRIORITY_STYLE[task.priority])}>
            {t(`priorities.${task.priority}`)}
          </span>
        </div>
        {task.description && <p className="mt-1 line-clamp-2 whitespace-pre-wrap text-xs text-slate-400">{task.description}</p>}
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {task.assignedToName && (
            <Chip icon="user" className={task.assignedToId !== currentUserId ? "bg-brand-500/15 text-brand-300" : undefined}>
              {task.assignedToId === currentUserId ? t("me") : task.assignedToName}
            </Chip>
          )}
          {task.dueDate && (
            <Chip icon="calendar" className={overdue ? "bg-rose-500/15 font-semibold text-rose-300" : undefined}>
              {task.dueDate.slice(0, 10)}
              {overdue && ` · ${t("overdue")}`}
            </Chip>
          )}
          {task.hours ? <Chip icon="clock">{task.hours} u</Chip> : null}
          {task.projectName && <Chip icon="folder">{task.projectName}</Chip>}
          {task.customerName && <Chip icon="briefcase">{task.customerName}</Chip>}
        </div>
        <div className="mt-2.5 flex items-center gap-2 border-t border-white/[0.04] pt-2">
          {task.status === "TODO" && (
            <button onClick={() => setStatus(task, "IN_PROGRESS")} className="rounded-md bg-amber-500/10 px-2 py-1 text-xs font-semibold text-amber-300 hover:bg-amber-500/20">
              {t("start")}
            </button>
          )}
          {task.status !== "DONE" ? (
            <button onClick={() => complete(task)} className="rounded-md bg-emerald-500/10 px-2 py-1 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/20">
              {t("complete")}
            </button>
          ) : (
            <button onClick={() => setStatus(task, "TODO")} className="rounded-md bg-white/5 px-2 py-1 text-xs font-semibold text-slate-400 hover:bg-white/10">
              {t("reopen")}
            </button>
          )}
          <div className="flex-1" />
          <button onClick={() => startEdit(task)} className="text-xs font-medium text-brand-400 hover:underline">{t("edit")}</button>
          <button onClick={() => setRemoving(task)} className="text-xs font-medium text-rose-400 hover:underline">{t("remove")}</button>
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-5">
      {/* KPI's */}
      <div data-tour="tasks-kpis" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label={t("kpiOpen")} value={String(byColumn("TODO").length)} icon="invoice" tone="brand" />
        <StatCard label={t("kpiInProgress")} value={String(byColumn("IN_PROGRESS").length)} icon="timer" tone="amber" />
        <StatCard label={t("kpiOverdue")} value={String(overdueCount)} icon="alert" tone="rose" />
        <StatCard label={t("kpiDone")} value={String(byColumn("DONE").length)} icon="check-circle" tone="green" />
      </div>

      {/* Filters */}
      <div data-tour="tasks-filters" className="flex flex-wrap items-center gap-2">
        {canSeeAll && !fixedAssigneeId && (
          <div className="flex gap-1">
            <button onClick={() => setScope("me")} className={cn("rounded-lg px-3 py-1.5 text-xs font-medium", scope === "me" ? "bg-brand-600 text-white" : "bg-white/5 text-slate-400 hover:bg-white/10")}>{t("filterMine")}</button>
            <button onClick={() => setScope("all")} className={cn("rounded-lg px-3 py-1.5 text-xs font-medium", scope === "all" ? "bg-brand-600 text-white" : "bg-white/5 text-slate-400 hover:bg-white/10")}>{t("filterAll")}</button>
          </div>
        )}
        <Input placeholder={t("searchPlaceholder")} value={query} onChange={(e) => setQuery(e.target.value)} className="w-52" />
        <Select
          value={prioFilter}
          onChange={(v) => setPrioFilter(v as "ALL" | Priority)}
          options={[
            { value: "ALL", label: t("allPriorities") },
            { value: "URGENT", label: t("priorities.URGENT") },
            { value: "HIGH", label: t("priorities.HIGH") },
            { value: "NORMAL", label: t("priorities.NORMAL") },
            { value: "LOW", label: t("priorities.LOW") },
          ]}
        />
        <div className="flex-1" />
        <div data-tour="tasks-new">
          <Button onClick={() => (open ? setOpen(false) : startAdd())}>+ {t("new")}</Button>
        </div>
      </div>

      {/* Formulier */}
      {open && (
        <form onSubmit={submit} className="grid grid-cols-1 gap-3 rounded-2xl border border-white/[0.06] bg-[#12112a]/60 backdrop-blur-md p-5 sm:grid-cols-2 lg:grid-cols-4">
          <h3 className="col-span-full font-semibold text-white">{editingId ? t("editTitle") : t("new")}</h3>
          <Input label={t("taskTitle")} className="col-span-full" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
          <div className="col-span-full flex flex-col gap-1">
            <label className="text-sm font-medium text-slate-300">{t("description")}</label>
            <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white placeholder-slate-500" />
          </div>
          {!fixedAssigneeId && (
            <Select
              label={t("assignTo")}
              value={form.assignedToId}
              onChange={(v) => setForm({ ...form, assignedToId: v })}
              options={teamOptions.map((o) => ({ value: o.id, label: o.id === currentUserId ? t("me") : o.name }))}
            />
          )}
          <Select
            label={t("priority")}
            value={form.priority}
            onChange={(v) => setForm({ ...form, priority: v as Priority })}
            options={[
              { value: "URGENT", label: t("priorities.URGENT") },
              { value: "HIGH", label: t("priorities.HIGH") },
              { value: "NORMAL", label: t("priorities.NORMAL") },
              { value: "LOW", label: t("priorities.LOW") },
            ]}
          />
          <Input type="date" label={t("dueDate")} value={form.dueDate} min="2000-01-01" max="2200-12-31" onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
          <Input type="number" step="0.25" label={t("hours")} value={form.hours} onChange={(e) => setForm({ ...form, hours: Number(e.target.value) })} />
          {projectOptions.length > 0 && (
            <Select
              label={t("project")}
              value={form.projectId}
              onChange={(v) => setForm({ ...form, projectId: v })}
              options={[{ value: "", label: t("none") }, ...projectOptions.map((o) => ({ value: o.id, label: o.name }))]}
            />
          )}
          {customerOptions.length > 0 && (
            <Select
              label={t("customer")}
              value={form.customerId}
              onChange={(v) => setForm({ ...form, customerId: v })}
              options={[{ value: "", label: t("none") }, ...customerOptions.map((o) => ({ value: o.id, label: o.name }))]}
            />
          )}
          <div className="col-span-full flex gap-2">
            <Button type="submit" disabled={saving || !form.title}>{saving ? "..." : editingId ? t("save") : t("add")}</Button>
            <Button type="button" variant="ghost" onClick={() => { setOpen(false); setEditingId(null); }}>{t("cancel")}</Button>
          </div>
        </form>
      )}

      {/* Kanban-bord: sleep kaarten tussen kolommen (of gebruik de knoppen) */}
      <div data-tour="tasks-board" className="grid gap-4 lg:grid-cols-3">
        {COLUMNS.map((col) => {
          const list = byColumn(col.status);
          return (
            <div
              key={col.status}
              onDragOver={(e) => { e.preventDefault(); setDragOver(col.status); }}
              onDragLeave={() => setDragOver(null)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(null);
                const id = e.dataTransfer.getData("text/task-id");
                const task = tasks.find((x) => x.id === id);
                if (task) setStatus(task, col.status);
              }}
              className={cn(
                "flex min-h-[180px] flex-col rounded-2xl border border-t-4 border-white/[0.06] bg-white/[0.03] p-3 transition-colors",
                col.accent,
                dragOver === col.status && "bg-brand-500/10 ring-2 ring-brand-500/40",
              )}
            >
              <div className="mb-2 flex items-center justify-between px-1">
                <h2 className="text-sm font-semibold text-white">{t(`columns.${col.status}`)}</h2>
                <span className="rounded-full bg-white/10 px-2 text-xs font-semibold text-slate-300">{list.length}</span>
              </div>
              <div className="flex flex-col gap-2">
                {list.length === 0 ? (
                  <p className="px-1 py-4 text-center text-xs text-slate-500">{t("columnEmpty")}</p>
                ) : (
                  list.map(card)
                )}
              </div>
            </div>
          );
        })}
      </div>
      <p className="text-xs text-slate-500">{t("dragHint")}</p>

      {/* Custom "taak afronden"-modal — vervangt de native window.prompt() */}
      {completing && (
        <div
          className="fixed inset-0 z-[95] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
          onClick={() => setCompleting(null)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#12112a] p-6 shadow-2xl shadow-black/50"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 flex-none items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400">
                <Icon name="check" className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <h3 className="font-semibold text-white">{t("completeTitle")}</h3>
                <p className="truncate text-sm text-slate-400">{completing.title}</p>
              </div>
            </div>

            <div className="mt-5">
              <label htmlFor="complete-hours" className="text-sm font-medium text-slate-300">
                {t("hoursPrompt")}
              </label>
              <input
                id="complete-hours"
                type="number"
                min="0"
                step="0.25"
                autoFocus
                value={completeHours}
                onChange={(e) => setCompleteHours(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") confirmComplete();
                  if (e.key === "Escape") setCompleting(null);
                }}
                className="mt-2 w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white outline-none transition-colors focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
              />
              <p className="mt-2 text-xs text-slate-500">{t("completeHint")}</p>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setCompleting(null)}>
                {t("cancel")}
              </Button>
              <Button type="button" onClick={confirmComplete}>
                {t("confirmLog")}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Custom verwijder-bevestiging — vervangt de native window.confirm() */}
      {removing && (
        <div
          className="fixed inset-0 z-[95] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
          onClick={() => setRemoving(null)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#12112a] p-6 shadow-2xl shadow-black/50"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 flex-none items-center justify-center rounded-xl bg-rose-500/10 text-rose-400">
                <Icon name="trash" className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <h3 className="font-semibold text-white">{t("removeTitle")}</h3>
                <p className="truncate text-sm text-slate-400">{removing.title}</p>
              </div>
            </div>

            <p className="mt-4 text-sm text-slate-400">{t("removeConfirm")}</p>

            <div className="mt-6 flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setRemoving(null)}>
                {t("cancel")}
              </Button>
              <Button type="button" variant="danger" onClick={confirmRemove}>
                {t("remove")}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
