"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useStore } from "@/lib/store";
import type { Priority, Task } from "@/lib/types";
import { TaskTable, type SortKey, type SortState } from "@/components/TaskTable";
import { TaskDetail } from "@/components/TaskDetail";
import { NewTaskModal } from "@/components/NewTaskModal";
import { BatchImportModal } from "@/components/BatchImportModal";
import { WORKDAY_HOURS, fmtDuration, fmtHours, initials, logMs, projectPath, startOfToday } from "@/lib/util";

const STATUS_ORDER: Record<Task["status"], number> = { today: 0, active: 1, review: 2, done: 3 };

export default function MyDayPage() {
  return (
    <Suspense>
      <MyDay />
    </Suspense>
  );
}

function MyDay() {
  const store = useStore();
  const { me, profiles, projects, tasks, logs, updateTask, completeTask } = store;
  const params = useSearchParams();

  // Managers can open anyone's My Day with ?u=<profile id>
  const target = (me?.is_manager && profiles.find((p) => p.id === params.get("u"))) || me!;
  const isOwnDay = target.id === me!.id;

  const [showActive, setShowActive] = useState(false);
  const [showReview, setShowReview] = useState(false);
  const [prio, setPrio] = useState<Priority | null>(null);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortState | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [modal, setModal] = useState<"new" | "import" | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const detailRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);

  const projectsById = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);
  const profilesById = useMemo(() => new Map(profiles.map((p) => [p.id, p])), [profiles]);

  const mine = useMemo(() => tasks.filter((t) => t.assignee_id === target.id), [tasks, target.id]);
  const todayTasks = mine.filter((t) => t.status === "today");
  const activeTasks = mine.filter((t) => t.status === "active");
  const reviewTasks = mine.filter((t) => t.status === "review");
  const open = [...todayTasks, ...activeTasks];

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

  // ----- rows -----
  const rows = useMemo(() => {
    let list = [...todayTasks, ...(showActive ? activeTasks : []), ...(showReview ? reviewTasks : [])];
    if (prio) list = list.filter((t) => t.priority === prio);
    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter((t) =>
        [t.title, t.job_role ?? "", projectPath(t.project_id, projectsById)].some((s) => s.toLowerCase().includes(q)),
      );
    }
    const val = (t: Task, k: SortKey): string | number => {
      switch (k) {
        case "project": return projectPath(t.project_id, projectsById).toLowerCase();
        case "assignee": return (t.assignee_id ? profilesById.get(t.assignee_id)?.name ?? "" : "").toLowerCase();
        case "time": return timeByTask.get(t.id) ?? 0;
        case "htc": return t.htc ?? -1;
        case "completed_at": return t.completed_at ?? "";
        case "priority": return t.priority === "need" ? 0 : 1;
        case "title": case "job_role": case "difficulty": return (t[k] ?? "").toLowerCase();
        default: return t[k] as number;
      }
    };
    return list.sort((a, b) => {
      if (sort) {
        const va = val(a, sort.key), vb = val(b, sort.key);
        if (va < vb) return -sort.dir;
        if (va > vb) return sort.dir;
      }
      return (
        STATUS_ORDER[a.status] - STATUS_ORDER[b.status] ||
        (a.priority === b.priority ? 0 : a.priority === "need" ? -1 : 1) ||
        a.created_at.localeCompare(b.created_at)
      );
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, target.id, showActive, showReview, prio, query, sort, projectsById, profilesById, timeByTask]);

  const selected = selectedId ? tasks.find((t) => t.id === selectedId) ?? null : null;
  useEffect(() => {
    if (selected && window.matchMedia("(max-width: 900px)").matches) {
      detailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ----- actions -----
  const nowIso = () => new Date().toISOString();
  const onComplete = (t: Task) => {
    if (selectedId === t.id) setSelectedId(null);
    if (running?.task_id === t.id && isOwnDay) store.stopTimer();
    completeTask(t.id);
  };
  const actions = {
    onComplete,
    onToday: (t: Task) => updateTask(t.id, { status: "today", today_at: nowIso() }),
    onActive: (t: Task) => updateTask(t.id, { status: "active", today_at: null }),
    onReopen: (t: Task) => updateTask(t.id, { status: "active", completed_at: null, progress: Math.min(t.progress, 90) }),
    onApprove: (t: Task) => updateTask(t.id, { status: "done" }),
    onProgress: (t: Task, v: number) => (v >= 100 ? onComplete(t) : updateTask(t.id, { progress: v })),
  };
  const onSort = (k: SortKey) =>
    setSort((s) => (!s || s.key !== k ? { key: k, dir: 1 } : s.dir === 1 ? { key: k, dir: -1 } : null));

  const allCount = open.length + reviewTasks.length;

  return (
    <div className="myday">
      <aside className="side" aria-label="My Day summary">
        <div className="side-scroll">
          <h1 style={{ fontSize: 30 }}>{isOwnDay ? "My Day" : `${target.name}'s Day`}</h1>

          <div className="card">
            <div className="person">
              <div className="avatar" aria-hidden="true">{initials(target.name)}</div>
              <div>
                <div className="person-name">{target.name}</div>
                <div className="person-role">{target.job_role ?? "No job role set"}</div>
              </div>
              <span className={`inout ${running ? "in" : ""}`}>{running ? "In" : "Out"}</span>
            </div>

            <div className="meter">
              <div className="meter-row">
                <span>Time logged today</span>
                <span>{fmtDuration(loggedToday)} / {fmtHours(plannedHours) || "0h"}</span>
              </div>
              <div className="meter-bar">
                <span style={{ width: `${plannedHours ? Math.min(100, (loggedToday / 3600000 / plannedHours) * 100) : 0}%` }} />
              </div>
            </div>
            <div className="meter">
              <div className="meter-row">
                <span>Workload ({WORKDAY_HOURS}h day)</span>
                <span>{workload}%</span>
              </div>
              <div className={`meter-bar ${workload > 100 ? "over" : ""}`}>
                <span style={{ width: `${Math.min(100, workload)}%` }} />
              </div>
            </div>

            <div className="counters">
              <button className={`counter ${prio === "need" ? "on" : ""}`} onClick={() => setPrio(prio === "need" ? null : "need")} aria-pressed={prio === "need"}>
                <b>{open.filter((t) => t.priority === "need").length}</b><span>Need-to-have</span>
              </button>
              <button className={`counter ${prio === "nice" ? "on" : ""}`} onClick={() => setPrio(prio === "nice" ? null : "nice")} aria-pressed={prio === "nice"}>
                <b>{open.filter((t) => t.priority === "nice").length}</b><span>Nice-to-have</span>
              </button>
              <button className={`counter ${showActive ? "on" : ""}`} onClick={() => setShowActive(!showActive)} aria-pressed={showActive}>
                <b>{activeTasks.length}</b><span>Active</span>
              </button>
              <button className={`counter ${showReview ? "on" : ""}`} onClick={() => setShowReview(!showReview)} aria-pressed={showReview}>
                <b>{reviewTasks.length}</b><span>In review</span>
              </button>
              <button
                className={`counter wide ${showActive && showReview ? "on" : ""}`}
                onClick={() => {
                  const all = !(showActive && showReview);
                  setShowActive(all);
                  setShowReview(all);
                  setPrio(null);
                }}
                aria-pressed={showActive && showReview}
              >
                <b>{allCount}</b><span>All</span>
              </button>
            </div>
          </div>

          <div ref={detailRef}>
            {selected ? (
              <TaskDetail
                task={selected}
                projects={projects}
                projectsById={projectsById}
                profiles={profiles}
                timeIn={timeByTask.get(selected.id) ?? 0}
                runningTaskId={running?.task_id ?? null}
                isManager={!!me?.is_manager}
                isOwnDay={isOwnDay}
                onClose={() => setSelectedId(null)}
                {...actions}
              />
            ) : (
              <p className="hint">Select a task to view, edit or update it.</p>
            )}
          </div>
        </div>
        <div className="side-foot">
          <button className="btn btn-primary" onClick={() => setModal("new")}>+ New task</button>
          <button className="btn" onClick={() => setModal("import")}>+ Batch import</button>
        </div>
      </aside>

      <section className="main" aria-label="Tasks">
        <div className="toolbar">
          <span className="count">{rows.length} task{rows.length === 1 ? "" : "s"}</span>
          {sort && <button className="btn btn-sm" onClick={() => setSort(null)}>Clear sort</button>}
          {prio && <button className="btn btn-sm" onClick={() => setPrio(null)}>Clear filter: {prio === "need" ? "Need" : "Nice"}-to-have</button>}
          <label className="search">
            <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><circle cx="7" cy="7" r="5" fill="none" stroke="currentColor" strokeWidth="1.5" /><path d="M11 11l3.5 3.5" stroke="currentColor" strokeWidth="1.5" /></svg>
            <input placeholder="Search title, project, job role…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search tasks" />
          </label>
        </div>

        <div className="table-wrap">
          {todayTasks.length === 0 && !showActive && !showReview ? (
            <div className="empty">
              <h2>Nothing on today yet</h2>
              <p style={{ margin: 0 }}>Pick tasks from your active list to plan the day.</p>
              <button className="btn btn-primary" onClick={() => setShowActive(true)}>
                Show active tasks ({activeTasks.length})
              </button>
            </div>
          ) : (
            <>
              <TaskTable
                rows={rows}
                projectsById={projectsById}
                profilesById={profilesById}
                timeByTask={timeByTask}
                selectedId={selectedId}
                sort={sort}
                canApprove={!!me?.is_manager}
                onSort={onSort}
                onSelect={(id) => setSelectedId(id === selectedId ? null : id)}
                {...actions}
              />
              {rows.length === 0 && <p className="hint">No tasks match.</p>}
            </>
          )}
        </div>

        <div className="bottombar">
          <button className={`toggle ${showActive ? "on" : ""}`} onClick={() => setShowActive(!showActive)} aria-pressed={showActive}>
            {showActive ? "Hide" : "Show"} active tasks ({activeTasks.length})
          </button>
          <button className={`toggle ${showReview ? "on" : ""}`} onClick={() => setShowReview(!showReview)} aria-pressed={showReview}>
            {showReview ? "Hide" : "Show"} review tasks ({reviewTasks.length})
          </button>
        </div>
      </section>

      {modal === "new" && (
        <NewTaskModal defaultAssignee={target} projects={projects} projectsById={projectsById} onClose={() => setModal(null)} />
      )}
      {modal === "import" && (
        <BatchImportModal defaultAssignee={target} projects={projects} projectsById={projectsById} onClose={() => setModal(null)} />
      )}
    </div>
  );
}
