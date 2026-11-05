"use client";

import { useEffect, useState } from "react";
import type { Profile, Project, Task } from "@/lib/types";
import { carriedFrom, fmtDateTime, fmtDuration, fmtHours, projectPath } from "@/lib/util";

export type SortKey = "title" | "progress" | "job_role" | "project" | "priority" | "difficulty" | "assignee" | "time" | "htc" | "completed_at";
export interface SortState {
  key: SortKey;
  dir: 1 | -1;
}

interface Props {
  rows: Task[];
  projectsById: Map<string, Project>;
  profilesById: Map<string, Profile>;
  timeByTask: Map<string, number>;
  selectedId: string | null;
  sort: SortState | null;
  canApprove: boolean;
  onSort: (k: SortKey) => void;
  onSelect: (id: string) => void;
  onProgress: (t: Task, value: number) => void;
  onComplete: (t: Task) => void;
  onToday: (t: Task) => void;
  onActive: (t: Task) => void;
  onReopen: (t: Task) => void;
  onApprove: (t: Task) => void;
}

const COLS: { key: SortKey | null; label: string; cls: string; num?: boolean }[] = [
  { key: null, label: "", cls: "c-chk" },
  { key: "title", label: "Title", cls: "c-title" },
  { key: "progress", label: "Progress", cls: "c-prog" },
  { key: "job_role", label: "Job role", cls: "c-role" },
  { key: "project", label: "Project", cls: "c-proj" },
  { key: "priority", label: "Priority", cls: "c-prio" },
  { key: "difficulty", label: "Diff.", cls: "c-diff" },
  { key: "assignee", label: "Assignee", cls: "c-asg" },
  { key: "time", label: "Time in", cls: "c-time", num: true },
  { key: "htc", label: "HTC", cls: "c-htc", num: true },
  { key: "completed_at", label: "Completed", cls: "c-date" },
  { key: null, label: "", cls: "c-act" },
];

export function TaskTable(p: Props) {
  return (
    <div role="table" aria-label="Tasks">
      <div className="grid-row grid-head" role="row">
        {COLS.map((c, i) => (
          <div key={i} className={`cell ${c.cls} ${c.num ? "num" : ""}`} role="columnheader"
            aria-sort={c.key && p.sort?.key === c.key ? (p.sort.dir === 1 ? "ascending" : "descending") : undefined}>
            {c.key ? (
              <button onClick={() => p.onSort(c.key!)} className={p.sort?.key === c.key ? "sorted" : ""}>
                {c.label}
                {p.sort?.key === c.key && <span aria-hidden="true">{p.sort.dir === 1 ? "▲" : "▼"}</span>}
              </button>
            ) : (
              c.label
            )}
          </div>
        ))}
      </div>
      {p.rows.map((t) => (
        <Row key={t.id} t={t} {...p} />
      ))}
    </div>
  );
}

function Row({ t, ...p }: Props & { t: Task }) {
  const [prog, setProg] = useState(t.progress);
  useEffect(() => setProg(t.progress), [t.progress]);
  const project = projectPath(t.project_id, p.projectsById);
  const assignee = t.assignee_id ? p.profilesById.get(t.assignee_id)?.name ?? "" : "";
  const carried = carriedFrom(t);
  const time = p.timeByTask.get(t.id) ?? 0;
  const done = t.status === "review" || t.status === "done";
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();

  function commit() {
    if (prog === t.progress) return;
    p.onProgress(t, prog);
  }

  return (
    <div
      role="row"
      className={`grid-row task-row ${t.status} ${p.selectedId === t.id ? "selected" : ""}`}
      onClick={() => p.onSelect(t.id)}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" && e.target === e.currentTarget) p.onSelect(t.id);
      }}
    >
      <div className="cell c-chk" role="cell" onClick={stop}>
        <input
          type="checkbox"
          aria-label={done ? `Reopen ${t.title}` : `Complete ${t.title}`}
          checked={done}
          onChange={() => (done ? p.onReopen(t) : p.onComplete(t))}
        />
      </div>
      <div className="cell c-title title-cell" role="cell">
        {t.title}
        {carried && <span className="carry">Carried from {carried}</span>}
        {t.status === "review" && <small>In review</small>}
      </div>
      <div className="cell c-prog progress" role="cell" onClick={stop}>
        <input
          type="range"
          min={0}
          max={100}
          step={5}
          value={prog}
          disabled={done}
          aria-label={`Progress for ${t.title}`}
          onChange={(e) => setProg(Number(e.target.value))}
          onPointerUp={commit}
          onKeyUp={commit}
          onBlur={commit}
        />
        <span>{prog}%</span>
      </div>
      <div className="cell c-role" role="cell">{t.job_role}</div>
      <div className="cell c-proj proj" role="cell" title={project}>{project}</div>
      <div className="cell c-prio" role="cell">
        <span className={`pill ${t.priority}`}>{t.priority === "need" ? "NEED" : "NICE"}</span>
      </div>
      <div className="cell c-diff" role="cell">
        <span className={`pill ${t.difficulty === "MOD" ? "mod" : ""}`}>{t.difficulty}</span>
      </div>
      <div className="cell c-asg" role="cell">{assignee}</div>
      <div className="cell c-time num" role="cell">{time ? fmtDuration(time) : "–"}</div>
      <div className="cell c-htc num" role="cell">{fmtHours(t.htc) || "–"}</div>
      <div className="cell c-date date" role="cell">{fmtDateTime(t.completed_at)}</div>
      <div className="cell c-meta" role="cell">
        {project && <span>{project}</span>}
        <span className={`pill ${t.priority}`}>{t.priority === "need" ? "NEED" : "NICE"}</span>
        <span className="pill">{t.difficulty}</span>
        {t.htc ? <span>HTC {fmtHours(t.htc)}</span> : null}
        {time ? <span>In {fmtDuration(time)}</span> : null}
      </div>
      <div className="cell c-act" role="cell" onClick={stop} style={{ textAlign: "right" }}>
        {t.status === "active" && (
          <button className="btn btn-sm btn-primary" onClick={() => p.onToday(t)}>Work on today</button>
        )}
        {t.status === "today" && (
          <button className="btn btn-sm" onClick={() => p.onActive(t)}>Move to active</button>
        )}
        {t.status === "review" && p.canApprove && (
          <button className="btn btn-sm btn-primary" onClick={() => p.onApprove(t)}>Approve</button>
        )}
      </div>
    </div>
  );
}
