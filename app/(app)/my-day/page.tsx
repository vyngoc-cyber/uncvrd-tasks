"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useStore } from "@/lib/store";
import type { Task, Tier } from "@/lib/types";
import { TaskTable, type SortKey, type SortState } from "@/components/TaskTable";
import { TaskDetail } from "@/components/TaskDetail";
import { NewTaskModal } from "@/components/NewTaskModal";
import { BatchImportModal } from "@/components/BatchImportModal";
import { ChoiceDialog, DifficultyDialog, PriorityDialog, ProgressDialog } from "@/components/Dialogs";
import { WORKDAY_HOURS, fmtDuration, fmtHours, initials, logMs, projectPath, startOfToday } from "@/lib/util";

// today need (yellow), today nice (blue), active (white), on hold, review
const GROUP: Record<string, number> = { "today-need": 0, "today-nice": 1, active: 2, hold: 3, review: 4, done: 5 };
const groupOf = (t: Task) => GROUP[t.status === "today" ? `today-${t.tier}` : t.status]!;

type DialogState =
  | { kind: "priority"; ids: string[]; initial: number }
  | { kind: "difficulty"; ids: string[]; initial: Task["difficulty"] | null }
  | { kind: "progress"; ids: string[]; initial: number }
  | { kind: "client"; ids: string[] }
  | { kind: "new" }
  | { kind: "import" }
  | null;

export default function MyDayPage() {
  return (
    <Suspense>
      <MyDay />
    </Suspense>
  );
}

function MyDay() {
  const store = useStore();
  const { me, profiles, projects, clients, tasks, logs, attendance, updateTask, updateTasks, completeTasks, duplicateTasks, deleteTasks, createProject, createClient, pushToast } = store;
  const params = useSearchParams();

  const target = (me?.is_manager && profiles.find((p) => p.id === params.get("u"))) || me!;
  const isOwnDay = target.id === me!.id;
  const isManager = !!me?.is_manager;

  const [showActive, setShowActive] = useState(false);
  const [showReview, setShowReview] = useState(false);
  const [showHold, setShowHold] = useState(false);
  const [tierFilter, setTierFilter] = useState<Tier | null>(null);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortState | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dialog, setDialog] = useState<DialogState>(null);
  const [now, setNow] = useState(() => Date.now());
  const lastClicked = useRef<string | null>(null);
  const detailRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);

  const projectsById = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);
  const profilesById = useMemo(() => new Map(profiles.map((p) => [p.id, p])), [profiles]);
  const projectOptions = useMemo(
    () => projects.filter((x) => !x.archived).map((x) => ({ id: x.id, path: projectPath(x.id, projectsById) })).sort((a, b) => a.path.localeCompare(b.path)),
    [projects, projectsById],
  );
  const pathOf = (id: string | null) => projectPath(id, projectsById);

  const mine = useMemo(() => tasks.filter((t) => t.assignee_id === target.id), [tasks, target.id]);
  const todayTasks = mine.filter((t) => t.status === "today");
  const activeTasks = mine.filter((t) => t.status === "active");
  const holdTasks = mine.filter((t) => t.status === "hold");
  const reviewTasks = mine.filter((t) => t.status === "review");

  const timeByTask = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of logs) m.set(l.task_id, (m.get(l.task_id) ?? 0) + logMs(l, undefined, now));
    return m;
  }, [logs, now]);

  const sod = startOfToday();
  const myLogs = logs.filter((l) => l.user_id === target.id);
  const loggedToday = myLogs.reduce((s, l) => (l.ended_at && new Date(l.ended_at) < sod ? s : s + logMs(l, sod, now)), 0);
  const running = myLogs.find((l) => !l.ended_at) ?? null;
  const plannedHours = todayTasks.reduce((s, t) => s + (t.htc ?? 0), 0);
  const workload = Math.round((plannedHours / WORKDAY_HOURS) * 100);
  const presence = attendance.find((a) => a.user_id === target.id && !a.ended_at);

  // ----- rows -----
  const rows = useMemo(() => {
    let list = [...todayTasks, ...(showActive ? activeTasks : []), ...(showHold ? holdTasks : []), ...(showReview ? reviewTasks : [])];
    if (tierFilter) list = list.filter((t) => t.tier === tierFilter);
    const q = query.trim().toLowerCase();
    if (q) list = list.filter((t) => [t.title, t.job_role ?? "", pathOf(t.project_id)].some((s) => s.toLowerCase().includes(q)));
    const val = (t: Task, k: SortKey): string | number => {
      switch (k) {
        case "project": return pathOf(t.project_id).toLowerCase();
        case "assignee": return (t.assignee_id ? profilesById.get(t.assignee_id)?.name ?? "" : "").toLowerCase();
        case "time": return timeByTask.get(t.id) ?? 0;
        case "htc": return t.htc ?? -1;
        case "completed_at": return t.completed_at ?? "";
        case "difficulty": return ["SIMP", "MOD", "COMP", "SUPC"].indexOf(t.difficulty);
        case "title": case "job_role": return (t[k] ?? "").toLowerCase();
        default: return t[k] as number;
      }
    };
    return list.sort((a, b) => {
      if (sort) {
        const va = val(a, sort.key), vb = val(b, sort.key);
        if (va < vb) return -sort.dir;
        if (va > vb) return sort.dir;
        return 0;
      }
      if (groupOf(a) !== groupOf(b)) return groupOf(a) - groupOf(b);
      if (a.status === "review") return (b.completed_at ?? "").localeCompare(a.completed_at ?? "");
      return a.sort_order - b.sort_order || a.priority - b.priority;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, target.id, showActive, showHold, showReview, tierFilter, query, sort, projectsById, profilesById, timeByTask]);

  // drop selections that left the list
  useEffect(() => {
    setSelected((s) => {
      const ids = new Set(rows.map((r) => r.id));
      const next = new Set([...s].filter((id) => ids.has(id)));
      return next.size === s.size ? s : next;
    });
  }, [rows]);

  const open = openId ? tasks.find((t) => t.id === openId) ?? null : null;
  useEffect(() => {
    if (open && window.matchMedia("(max-width: 900px)").matches) detailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [openId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ----- actions -----
  const canTime = (t: Task) => isOwnDay && (t.status === "today" || t.status === "active");
  const complete = (ids: string[]) => {
    if (openId && ids.includes(openId)) setOpenId(null);
    if (running && ids.includes(running.task_id) && isOwnDay) store.stopTimer();
    setSelected(new Set());
    completeTasks(ids);
  };
  const onProgress = (t: Task, v: number) => (v >= 100 ? complete([t.id]) : updateTask(t.id, { progress: v }));
  const onSort = (k: SortKey) => setSort((s) => (!s || s.key !== k ? { key: k, dir: 1 } : s.dir === 1 ? { key: k, dir: -1 } : null));

  function onToggle(id: string, shift: boolean) {
    setSelected((s) => {
      const next = new Set(s);
      if (shift && lastClicked.current) {
        const a = rows.findIndex((r) => r.id === lastClicked.current);
        const b = rows.findIndex((r) => r.id === id);
        if (a !== -1 && b !== -1) {
          const [lo, hi] = a < b ? [a, b] : [b, a];
          rows.slice(lo, hi + 1).forEach((r) => next.add(r.id));
          return next;
        }
      }
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    lastClicked.current = id;
  }

  function onReorder(dragId: string, targetId: string, before: boolean) {
    const list = rows.filter((r) => r.id !== dragId);
    const i = list.findIndex((r) => r.id === targetId);
    if (i === -1) return;
    const dragged = rows.find((r) => r.id === dragId)!;
    const target = list[i]!;
    const neighbour = before ? list[i - 1] : list[i + 1];
    const tOrder = target.sort_order;
    const nOrder = neighbour && groupOf(neighbour) === groupOf(target) ? neighbour.sort_order : before ? tOrder - 1 : tOrder + 1;
    const patch: Partial<Task> = { sort_order: (tOrder + nOrder) / 2 };
    // dragging into another colour band changes the task to match it
    if (groupOf(dragged) !== groupOf(target)) {
      if (target.status === "today") Object.assign(patch, { status: "today", tier: target.tier, ...(dragged.status !== "today" ? { today_at: new Date().toISOString() } : {}) });
      else if (target.status === "active" || target.status === "hold") Object.assign(patch, { status: target.status, today_at: null });
      else return;
    }
    updateTask(dragId, patch);
  }

  async function newProjectFor(t: Task) {
    const name = window.prompt("New project name. Use \\ for a sub-project, e.g. TKL Fulfillment \\ Monthly Issue");
    if (!name) return;
    const id = await createProject(name);
    if (id) updateTask(t.id, { project_id: id });
  }
  async function newClientFor(t: Task) {
    const name = window.prompt("New client name");
    if (!name) return;
    const id = await createClient(name);
    if (id) updateTask(t.id, { client_id: id });
  }

  const sel = [...selected];
  const selTasks = rows.filter((r) => selected.has(r.id));
  const nowIso = () => new Date().toISOString();
  async function setTier(tier: Tier) {
    const waiting = selTasks.filter((t) => t.status === "active" || t.status === "hold").map((t) => t.id);
    const rest = sel.filter((id) => !waiting.includes(id));
    if (waiting.length) await updateTasks(waiting, { tier, status: "today", today_at: nowIso() });
    if (rest.length) await updateTasks(rest, { tier });
  }
  const bulk = {
    stop: () => updateTasks(sel, { status: "active", today_at: null }),
    hold: () => updateTasks(sel, { status: "hold", today_at: null }),
    resume: () => updateTasks(sel, { status: "active" }),
    // Need/Nice-to-have also puts active or on-hold tasks onto today's list
    need: () => setTier("need"),
    nice: () => setTier("nice"),
    approve: () => updateTasks(sel, { status: "done" }),
    reopen: () => updateTasks(sel, { status: "active", completed_at: null, progress: 90 }),
    duplicate: () => duplicateTasks(sel),
    remove: async () => {
      if (!window.confirm(`Delete ${sel.length} task${sel.length === 1 ? "" : "s"}? This cannot be undone.`)) return;
      if (await deleteTasks(sel)) {
        pushToast({ message: `Deleted ${sel.length} task${sel.length === 1 ? "" : "s"}` });
        setSelected(new Set());
      }
    },
  };
  const anyStatus = (...s: Task["status"][]) => selTasks.some((t) => s.includes(t.status));
  const allClosed = selTasks.length > 0 && selTasks.every((t) => t.status === "review" || t.status === "done");

  const counts = {
    need: todayTasks.filter((t) => t.tier === "need").length,
    nice: todayTasks.filter((t) => t.tier === "nice").length,
  };
  const allCount = todayTasks.length + activeTasks.length + holdTasks.length + reviewTasks.length;

  return (
    <div className="myday">
      <aside className="side" aria-label="My Day summary">
        <div className="side-scroll">
          <h1 className="page-title">{isOwnDay ? "My Day" : `${target.name}'s Day`}</h1>

          <div className="card">
            <div className="person">
              <div className="avatar" aria-hidden="true">{initials(target.name)}</div>
              <div className="person-text">
                <div className="person-name">{target.name}</div>
                <div className="person-role">{target.job_role ?? "No job role set"}</div>
              </div>
              <span className={`presence ${presence?.kind ?? "out"}`}>{presence ? (presence.kind === "work" ? "Active" : "On break") : "Out"}</span>
            </div>

            <div className="meter">
              <div className="meter-row">
                <span>Time logged</span>
                <span>{fmtDuration(loggedToday)} / {fmtHours(plannedHours) || "0h"}</span>
              </div>
              <div className="meter-bar"><span style={{ width: `${plannedHours ? Math.min(100, (loggedToday / 3600000 / plannedHours) * 100) : 0}%` }} /></div>
            </div>
            <div className="meter">
              <div className="meter-row"><span>Workload</span><span>{workload}%</span></div>
              <div className={`meter-bar ${workload > 100 ? "over" : ""}`}><span style={{ width: `${Math.min(100, workload)}%` }} /></div>
            </div>

            <div className="counters">
              <button className={`counter ${tierFilter === "need" ? "on" : ""}`} onClick={() => setTierFilter(tierFilter === "need" ? null : "need")} aria-pressed={tierFilter === "need"}>
                <b>{counts.need}</b><span>Need-to-have</span>
              </button>
              <button className={`counter ${tierFilter === "nice" ? "on" : ""}`} onClick={() => setTierFilter(tierFilter === "nice" ? null : "nice")} aria-pressed={tierFilter === "nice"}>
                <b>{counts.nice}</b><span>Nice-to-have</span>
              </button>
              <button className={`counter ${!showActive && !showReview && !showHold && !tierFilter ? "on" : ""}`}
                onClick={() => { setShowActive(false); setShowReview(false); setShowHold(false); setTierFilter(null); }}>
                <b>{todayTasks.length}</b><span>Today</span>
              </button>
              <button className={`counter ${showReview ? "on" : ""}`} onClick={() => setShowReview(!showReview)} aria-pressed={showReview}>
                <b>{reviewTasks.length}</b><span>In review</span>
              </button>
              <button className={`counter wide ${showActive && showReview && showHold ? "on" : ""}`}
                onClick={() => { const all = !(showActive && showReview && showHold); setShowActive(all); setShowReview(all); setShowHold(all); setTierFilter(null); }}>
                <b>{allCount}</b><span>All</span>
              </button>
            </div>
          </div>

          <div ref={detailRef}>
            {open ? (
              <TaskDetail
                task={open}
                projectOptions={projectOptions}
                clients={clients}
                profiles={profiles}
                profilesById={profilesById}
                timeIn={timeByTask.get(open.id) ?? 0}
                running={running?.task_id === open.id}
                isManager={isManager}
                canTime={canTime(open)}
                onClose={() => setOpenId(null)}
                onComplete={(t) => complete([t.id])}
                onNewProject={newProjectFor}
                onNewClient={newClientFor}
              />
            ) : (
              <p className="hint">Select a task to view, edit or update it.</p>
            )}
          </div>
        </div>
        <div className="side-foot">
          <button className="btn btn-primary" onClick={() => setDialog({ kind: "new" })}>+ New task</button>
          <button className="btn" onClick={() => setDialog({ kind: "import" })}>+ Batch import</button>
        </div>
      </aside>

      <section className="main" aria-label="Tasks">
        <div className="toolbar">
          {selected.size === 0 ? (
            <>
              <span className="count">{rows.length} task{rows.length === 1 ? "" : "s"}</span>
              {sort && <button className="btn btn-sm" onClick={() => setSort(null)}>Clear sort</button>}
              {tierFilter && <button className="btn btn-sm" onClick={() => setTierFilter(null)}>Clear filter</button>}
            </>
          ) : (
            <div className="bulk" role="toolbar" aria-label="Actions for selected tasks">
              <span className="count">{selected.size} selected</span>
              <button className="btn btn-sm btn-ghost" onClick={() => setSelected(new Set())}>Clear</button>
              <span className="sep" />
              {selected.size === 1 && <button className="btn btn-sm" onClick={() => setOpenId(sel[0]!)}>Edit</button>}
              {anyStatus("today") && <button className="btn btn-sm" onClick={bulk.stop}>Stop working on</button>}
              {!allClosed && <button className="btn btn-sm" onClick={() => setDialog({ kind: "progress", ids: sel, initial: selTasks[0]?.progress ?? 0 })}>Status %</button>}
              <button className="btn btn-sm" onClick={bulk.need}>Need-to-have</button>
              <button className="btn btn-sm" onClick={bulk.nice}>Nice-to-have</button>
              {anyStatus("active", "today") && <button className="btn btn-sm" onClick={bulk.hold}>Put on hold</button>}
              {anyStatus("hold") && <button className="btn btn-sm" onClick={bulk.resume}>Resume</button>}
              <button className="btn btn-sm" onClick={() => setDialog({ kind: "priority", ids: sel, initial: selTasks[0]?.priority ?? 3 })}>Priority</button>
              <button className="btn btn-sm" onClick={() => setDialog({ kind: "difficulty", ids: sel, initial: selTasks.length === 1 ? selTasks[0]!.difficulty : null })}>Difficulty</button>
              <button className="btn btn-sm" onClick={() => setDialog({ kind: "client", ids: sel })}>Client</button>
              <button className="btn btn-sm" onClick={bulk.duplicate}>Duplicate</button>
              {!allClosed && <button className="btn btn-sm btn-primary" onClick={() => complete(sel)}>{isManager ? "Done" : "Send to review"}</button>}
              {isManager && anyStatus("review") && <button className="btn btn-sm btn-primary" onClick={bulk.approve}>Approve</button>}
              {anyStatus("review", "done") && <button className="btn btn-sm" onClick={bulk.reopen}>Reopen</button>}
              <button className="btn btn-sm btn-danger" onClick={bulk.remove}>Delete</button>
            </div>
          )}
          {selected.size === 0 && <label className="search">
            <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><circle cx="7" cy="7" r="5" fill="none" stroke="currentColor" strokeWidth="1.5" /><path d="M11 11l3.5 3.5" stroke="currentColor" strokeWidth="1.5" /></svg>
            <input placeholder="Search title, project, job role…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search tasks" />
          </label>}
        </div>

        <div className="table-wrap">
          {todayTasks.length === 0 && !showActive && !showReview && !showHold ? (
            <div className="empty">
              <h2>Nothing on today yet</h2>
              <p>Pick tasks from your active list to plan the day.</p>
              <button className="btn btn-primary" onClick={() => setShowActive(true)}>Show active tasks ({activeTasks.length})</button>
            </div>
          ) : (
            <>
              <TaskTable
                rows={rows}
                projectOptions={projectOptions}
                projectPathOf={pathOf}
                profiles={profiles}
                profilesById={profilesById}
                timeByTask={timeByTask}
                selected={selected}
                openId={openId}
                sort={sort}
                runningTaskId={isOwnDay ? running?.task_id ?? null : null}
                canTime={canTime}
                canAssign={isManager}
                canCreateProject={isManager}
                onSort={onSort}
                onToggle={onToggle}
                onToggleAll={() => setSelected((s) => (rows.every((r) => s.has(r.id)) ? new Set() : new Set(rows.map((r) => r.id))))}
                onOpen={(id) => setOpenId(id === openId ? null : id)}
                onReorder={onReorder}
                onPlay={(t) => store.startTimer(t.id)}
                onStop={() => store.stopTimer()}
                onProgress={onProgress}
                onPriority={(t) => setDialog({ kind: "priority", ids: [t.id], initial: t.priority })}
                onDifficulty={(t) => setDialog({ kind: "difficulty", ids: [t.id], initial: t.difficulty })}
                onPatch={(t, patch) => updateTask(t.id, patch)}
                onNewProject={newProjectFor}
              />
              {rows.length === 0 && <p className="hint">No tasks match.</p>}
            </>
          )}
        </div>

        <div className="bottombar">
          <button className={`toggle ${showReview ? "on" : ""}`} onClick={() => setShowReview(!showReview)} aria-pressed={showReview}>
            {showReview ? `Hide review tasks −${reviewTasks.length}` : `Show review tasks +${reviewTasks.length}`}
          </button>
          <button className={`toggle ${showActive ? "on" : ""}`} onClick={() => setShowActive(!showActive)} aria-pressed={showActive}>
            {showActive ? `Show only today's tasks −${activeTasks.length}` : `Show all active tasks +${activeTasks.length}`}
          </button>
          {holdTasks.length > 0 && (
            <button className={`toggle ${showHold ? "on" : ""}`} onClick={() => setShowHold(!showHold)} aria-pressed={showHold}>
              {showHold ? `Hide on hold −${holdTasks.length}` : `Show on hold +${holdTasks.length}`}
            </button>
          )}
        </div>
      </section>

      {dialog?.kind === "new" && <NewTaskModal defaultAssignee={target} projectOptions={projectOptions} onClose={() => setDialog(null)} />}
      {dialog?.kind === "import" && <BatchImportModal defaultAssignee={target} projects={projects} projectsById={projectsById} onClose={() => setDialog(null)} />}
      {dialog?.kind === "priority" && (
        <PriorityDialog initial={dialog.initial} onClose={() => setDialog(null)}
          onSave={(v) => { updateTasks(dialog.ids, { priority: v }); setDialog(null); }} />
      )}
      {dialog?.kind === "difficulty" && (
        <DifficultyDialog initial={dialog.initial} onClose={() => setDialog(null)}
          onSave={(v) => { updateTasks(dialog.ids, { difficulty: v }); setDialog(null); }} />
      )}
      {dialog?.kind === "progress" && (
        <ProgressDialog initial={dialog.initial} onClose={() => setDialog(null)}
          onSave={(v) => { if (v >= 100) complete(dialog.ids); else updateTasks(dialog.ids, { progress: v }); setDialog(null); }} />
      )}
      {dialog?.kind === "client" && (
        <ChoiceDialog title="Change client" options={clients.filter((c) => !c.archived).map((c) => ({ id: c.id, label: c.name }))}
          onClose={() => setDialog(null)}
          allowNew={isManager ? (name) => createClient(name) : undefined}
          onSave={(id) => { updateTasks(dialog.ids, { client_id: id }); setDialog(null); }} />
      )}
    </div>
  );
}
