"use client";

import { useEffect, useState } from "react";
import type { Profile, Task } from "@/lib/types";
import { HTC_PRESETS, PROGRESS_STATE_LABEL, carriedFrom, progressState, deadlineBadge, fmtDateTime, fmtDuration, fmtHours } from "@/lib/util";

export type SortKey = "title" | "progress" | "job_role" | "project" | "priority" | "difficulty" | "assignee" | "time" | "htc" | "completed_at";
export interface SortState {
  key: SortKey;
  dir: 1 | -1;
}

export interface TableProps {
  rows: Task[];
  projectOptions: { id: string; path: string }[];
  projectPathOf: (id: string | null) => string;
  profiles: Profile[];
  profilesById: Map<string, Profile>;
  timeByTask: Map<string, number>;
  selected: Set<string>;
  openId: string | null;
  sort: SortState | null;
  runningTaskId: string | null;
  canTime: (t: Task) => boolean;
  canAssign: boolean;
  canCreateProject: boolean;
  onSort: (k: SortKey) => void;
  onToggle: (id: string, shift: boolean) => void;
  onToggleAll: () => void;
  onOpen: (id: string) => void;
  onReorder: (dragId: string, targetId: string, before: boolean) => void;
  onPlay: (t: Task) => void;
  onStop: () => void;
  onProgress: (t: Task, v: number) => void;
  onPriority: (t: Task) => void;
  onDifficulty: (t: Task) => void;
  onPatch: (t: Task, patch: Partial<Task>) => void;
  onNewProject: (t: Task) => void;
}

const COLS: { key: SortKey | null; label: string; cls: string; num?: boolean }[] = [
  { key: null, label: "", cls: "c-sel" },
  { key: "title", label: "Title", cls: "c-title" },
  { key: "progress", label: "Prog.", cls: "c-prog" },
  { key: "job_role", label: "Job role", cls: "c-role" },
  { key: "project", label: "Project", cls: "c-proj" },
  { key: "priority", label: "Prio.", cls: "c-prio" },
  { key: "difficulty", label: "Diff.", cls: "c-diff" },
  { key: "assignee", label: "Assignee", cls: "c-asg" },
  { key: "time", label: "Time in", cls: "c-time", num: true },
  { key: "htc", label: "HTC", cls: "c-htc", num: true },
  { key: "completed_at", label: "Completed", cls: "c-date" },
];

export function TaskTable(p: TableProps) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropAt, setDropAt] = useState<{ id: string; before: boolean } | null>(null);
  const allOn = p.rows.length > 0 && p.rows.every((r) => p.selected.has(r.id));
  const someOn = !allOn && p.rows.some((r) => p.selected.has(r.id));

  return (
    <div role="table" aria-label="Tasks" className="tbl">
      <div className="grid-row grid-head" role="row">
        {COLS.map((c, i) => (
          <div key={i} className={`cell ${c.cls} ${c.num ? "num" : ""}`} role="columnheader"
            aria-sort={c.key && p.sort?.key === c.key ? (p.sort.dir === 1 ? "ascending" : "descending") : undefined}>
            {i === 0 ? (
              <input type="checkbox" aria-label="Select all" checked={allOn}
                ref={(el) => { if (el) el.indeterminate = someOn; }} onChange={p.onToggleAll} />
            ) : c.key ? (
              <button onClick={() => p.onSort(c.key!)} className={p.sort?.key === c.key ? "sorted" : ""}>
                {c.label}
                {p.sort?.key === c.key && <span aria-hidden="true">{p.sort.dir === 1 ? "↑" : "↓"}</span>}
              </button>
            ) : c.label}
          </div>
        ))}
      </div>
      {p.rows.map((t) => (
        <Row
          key={t.id}
          t={t}
          p={p}
          dragging={dragId === t.id}
          dropHint={dropAt?.id === t.id ? (dropAt.before ? "before" : "after") : null}
          onDragStart={() => setDragId(t.id)}
          onDragEnd={() => {
            setDragId(null);
            setDropAt(null);
          }}
          onDragOver={(before) => dragId && dragId !== t.id && setDropAt({ id: t.id, before })}
          onDrop={() => {
            if (dragId && dropAt && dragId !== dropAt.id) p.onReorder(dragId, dropAt.id, dropAt.before);
            setDragId(null);
            setDropAt(null);
          }}
        />
      ))}
    </div>
  );
}

function rowClass(t: Task) {
  if (t.status === "today") return t.tier === "nice" ? "today-nice" : "today-need";
  return t.status;
}

function Row({ t, p, dragging, dropHint, onDragStart, onDragEnd, onDragOver, onDrop }: {
  t: Task;
  p: TableProps;
  dragging: boolean;
  dropHint: "before" | "after" | null;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDragOver: (before: boolean) => void;
  onDrop: () => void;
}) {
  const [prog, setProg] = useState(t.progress);
  const [handleDown, setHandleDown] = useState(false);
  useEffect(() => setProg(t.progress), [t.progress]);
  const project = p.projectPathOf(t.project_id);
  const carried = carriedFrom(t);
  const dl = deadlineBadge(t);
  const time = p.timeByTask.get(t.id) ?? 0;
  const closed = t.status === "review" || t.status === "done";
  const running = p.runningTaskId === t.id;
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();
  const reorderable = !p.sort;

  function commit() {
    if (prog !== t.progress) p.onProgress(t, prog);
  }

  return (
    <div
      role="row"
      className={`grid-row task-row ${rowClass(t)} ${p.openId === t.id ? "open" : ""} ${p.selected.has(t.id) ? "picked" : ""} ${running ? "running" : ""} ${dragging ? "dragging" : ""} ${dropHint ? `drop-${dropHint}` : ""}`}
      onClick={() => p.onOpen(t.id)}
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && e.target === e.currentTarget && p.onOpen(t.id)}
      draggable={reorderable && handleDown}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", t.id);
        onDragStart();
      }}
      onDragEnd={() => {
        setHandleDown(false);
        onDragEnd();
      }}
      onDragOver={(e) => {
        e.preventDefault();
        const r = e.currentTarget.getBoundingClientRect();
        onDragOver(e.clientY < r.top + r.height / 2);
      }}
      onDrop={(e) => {
        e.preventDefault();
        onDrop();
      }}
    >
      <div className="cell c-sel" role="cell" onClick={stop}>
        {reorderable && (
          <span className="handle" title="Drag to reorder" aria-hidden="true"
            onMouseDown={() => setHandleDown(true)} onMouseUp={() => setHandleDown(false)}>⋮⋮</span>
        )}
        <input type="checkbox" aria-label={`Select ${t.title}`} checked={p.selected.has(t.id)}
          onChange={() => {}} onClick={(e) => p.onToggle(t.id, e.shiftKey)} />
      </div>
      <div className="cell c-title title-cell" role="cell">
        <div className="title-line">
          <span className="title-text">{t.title}</span>
          {t.repeat !== "none" && <span className="tag">{t.repeat.toUpperCase()}</span>}
          {t.status === "hold" && <span className="tag">ON HOLD</span>}
          {dl && <span className={`tag dl ${dl.urgent ? "urgent" : ""}`}>{dl.text}</span>}
          {p.canTime(t) && (
            <button
              className={`play ${running ? "on" : ""}`}
              onClick={(e) => {
                stop(e);
                if (running) p.onStop();
                else p.onPlay(t);
              }}
              aria-label={running ? `Stop timer on ${t.title}` : `Start timer on ${t.title}`}
              title={running ? "Stop timer" : "Start timer"}
            >
              {running ? <svg width="10" height="10" viewBox="0 0 10 10"><rect width="10" height="10" rx="1" fill="currentColor" /></svg>
                : <svg width="10" height="10" viewBox="0 0 10 10"><path d="M1 0l9 5-9 5z" fill="currentColor" /></svg>}
            </button>
          )}
        </div>
        {carried && <span className="sub">Carried from {carried}</span>}
      </div>
      <div className="cell c-prog progress" role="cell" onClick={stop}>
        <input
          type="range" min={0} max={100} step={5} value={prog} disabled={closed}
          className={`pstate-${progressState(t, prog, running)}`}
          title={PROGRESS_STATE_LABEL[progressState(t, prog, running)]}
          style={{ ["--pct" as string]: `${prog}%` }}
          aria-label={`Progress for ${t.title}, ${PROGRESS_STATE_LABEL[progressState(t, prog, running)]}`}
          onChange={(e) => setProg(Number(e.target.value))}
          onPointerUp={commit} onKeyUp={commit} onBlur={commit}
        />
        <span>{prog}%</span>
      </div>
      <div className="cell c-role" role="cell" title={t.job_role ?? ""}>{t.job_role}</div>
      <div className="cell c-proj" role="cell" onClick={stop}>
        <select className="cell-select" value={t.project_id ?? ""} title={project} aria-label="Project"
          onChange={(e) => {
            if (e.target.value === "__new") return p.onNewProject(t);
            p.onPatch(t, { project_id: e.target.value || null });
          }}>
          <option value="">–</option>
          {p.projectOptions.map((o) => <option key={o.id} value={o.id}>{o.path}</option>)}
          {p.canCreateProject && <option value="__new">+ New project…</option>}
        </select>
      </div>
      <div className="cell c-prio" role="cell" onClick={stop}>
        <button className="cell-btn" onClick={() => p.onPriority(t)} aria-label={`Priority ${t.priority.toFixed(1)}`}>{t.priority.toFixed(1)}</button>
      </div>
      <div className="cell c-diff" role="cell" onClick={stop}>
        <button className="pill" onClick={() => p.onDifficulty(t)} aria-label={`Difficulty ${t.difficulty}`}>{t.difficulty}</button>
      </div>
      <div className="cell c-asg" role="cell" onClick={stop}>
        {p.canAssign ? (
          <select className="cell-select" value={t.assignee_id ?? ""} aria-label="Assignee"
            onChange={(e) => p.onPatch(t, { assignee_id: e.target.value || null })}>
            <option value="">–</option>
            {p.profiles.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        ) : (
          <span>{t.assignee_id ? p.profilesById.get(t.assignee_id)?.name : ""}</span>
        )}
      </div>
      <div className={`cell c-time num ${time ? "has" : ""}`} role="cell">{time ? fmtDuration(time) : "–"}</div>
      <div className="cell c-htc num" role="cell" onClick={stop}>
        <select className="cell-select num" value={t.htc ?? ""} aria-label="Hours to complete"
          onChange={(e) => p.onPatch(t, { htc: e.target.value === "" ? null : Number(e.target.value) })}>
          <option value="">–</option>
          {t.htc !== null && !HTC_PRESETS.includes(t.htc) && <option value={t.htc}>{fmtHours(t.htc)}</option>}
          {HTC_PRESETS.map((h) => <option key={h} value={h}>{fmtHours(h)}</option>)}
        </select>
      </div>
      <div className="cell c-date date" role="cell">{fmtDateTime(t.completed_at) || "–"}</div>
      <div className="cell c-meta" role="cell">
        {project && <span>{project}</span>}
        <span className="pill">{t.priority.toFixed(1)}</span>
        <span className="pill">{t.difficulty}</span>
        {t.htc ? <span>HTC {fmtHours(t.htc)}</span> : null}
        {time ? <span>In {fmtDuration(time)}</span> : null}
      </div>
    </div>
  );
}
