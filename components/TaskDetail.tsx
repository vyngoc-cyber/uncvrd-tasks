"use client";

import { useEffect, useState } from "react";
import type { Difficulty, Priority, Profile, Project, Task } from "@/lib/types";
import { carriedFrom, fmtDateTime, fmtDuration, projectPath } from "@/lib/util";
import { useStore } from "@/lib/store";

interface Props {
  task: Task;
  projects: Project[];
  projectsById: Map<string, Project>;
  profiles: Profile[];
  timeIn: number;
  runningTaskId: string | null;
  isManager: boolean;
  isOwnDay: boolean;
  onClose: () => void;
  onComplete: (t: Task) => void;
  onToday: (t: Task) => void;
  onActive: (t: Task) => void;
  onReopen: (t: Task) => void;
  onApprove: (t: Task) => void;
}

export function TaskDetail({ task: t, ...p }: Props) {
  const { updateTask, startTimer, stopTimer } = useStore();
  const [draft, setDraft] = useState(t);
  useEffect(() => setDraft(t), [t]);

  const save = (patch: Partial<Task>) => {
    const changed = Object.entries(patch).some(([k, v]) => t[k as keyof Task] !== v);
    if (changed) updateTask(t.id, patch);
  };
  const running = p.runningTaskId === t.id;
  const carried = carriedFrom(t);
  const sortedProjects = [...p.projects]
    .filter((x) => !x.archived)
    .map((x) => ({ id: x.id, path: projectPath(x.id, p.projectsById) }))
    .sort((a, b) => a.path.localeCompare(b.path));

  return (
    <section className="detail card" aria-label="Task details">
      <div className="detail-head">
        <h2>Task</h2>
        <span className="pill" style={{ marginLeft: 4 }}>{statusLabel(t.status)}</span>
        <button className="btn btn-ghost btn-sm" style={{ marginLeft: "auto" }} onClick={p.onClose} aria-label="Close details">
          ✕
        </button>
      </div>
      {carried && <span className="carry">Carried from {carried}</span>}

      <div className="field">
        <label htmlFor="d-title">Title</label>
        <input id="d-title" className="input" value={draft.title}
          onChange={(e) => setDraft({ ...draft, title: e.target.value })}
          onBlur={() => draft.title.trim() && save({ title: draft.title.trim() })} />
      </div>

      <div className="field">
        <label htmlFor="d-proj">Project</label>
        <select id="d-proj" className="select" value={draft.project_id ?? ""}
          onChange={(e) => save({ project_id: e.target.value || null })}>
          <option value="">None</option>
          {sortedProjects.map((x) => (
            <option key={x.id} value={x.id}>{x.path}</option>
          ))}
        </select>
      </div>

      <div className="two">
        <div className="field">
          <label htmlFor="d-role">Job role</label>
          <input id="d-role" className="input" value={draft.job_role ?? ""}
            onChange={(e) => setDraft({ ...draft, job_role: e.target.value })}
            onBlur={() => save({ job_role: draft.job_role?.trim() || null })} />
        </div>
        <div className="field">
          <label htmlFor="d-htc">HTC (hours)</label>
          <input id="d-htc" className="input" type="number" min={0} step={0.5} value={draft.htc ?? ""}
            onChange={(e) => setDraft({ ...draft, htc: e.target.value === "" ? null : Number(e.target.value) })}
            onBlur={() => save({ htc: draft.htc })} />
        </div>
        <div className="field">
          <label htmlFor="d-prio">Priority</label>
          <select id="d-prio" className="select" value={draft.priority}
            onChange={(e) => save({ priority: e.target.value as Priority })}>
            <option value="need">Need-to-have</option>
            <option value="nice">Nice-to-have</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="d-diff">Difficulty</label>
          <select id="d-diff" className="select" value={draft.difficulty}
            onChange={(e) => save({ difficulty: e.target.value as Difficulty })}>
            <option value="SIMP">SIMP</option>
            <option value="MOD">MOD</option>
          </select>
        </div>
      </div>

      {p.isManager && (
        <div className="field">
          <label htmlFor="d-asg">Assignee</label>
          <select id="d-asg" className="select" value={draft.assignee_id ?? ""}
            onChange={(e) => save({ assignee_id: e.target.value || null })}>
            <option value="">Unassigned</option>
            {p.profiles.map((u) => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
        </div>
      )}

      <div className="field">
        <label htmlFor="d-notes">Notes</label>
        <textarea id="d-notes" className="textarea" value={draft.notes ?? ""}
          onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
          onBlur={() => save({ notes: draft.notes?.trim() || null })} />
      </div>

      <div className="row-actions">
        {p.isOwnDay && (t.status === "today" || t.status === "active") &&
          (running ? (
            <button className="btn btn-sm" onClick={() => stopTimer()}>Stop timer</button>
          ) : (
            <button className="btn btn-sm" onClick={() => startTimer(t.id)}>Start timer</button>
          ))}
        {t.status === "active" && <button className="btn btn-sm btn-primary" onClick={() => p.onToday(t)}>Work on today</button>}
        {t.status === "today" && <button className="btn btn-sm" onClick={() => p.onActive(t)}>Move to active</button>}
        {(t.status === "active" || t.status === "today") && (
          <button className="btn btn-sm" onClick={() => p.onComplete(t)}>{p.isManager ? "Mark done" : "Send to review"}</button>
        )}
        {t.status === "review" && p.isManager && <button className="btn btn-sm btn-primary" onClick={() => p.onApprove(t)}>Approve</button>}
        {(t.status === "review" || t.status === "done") && <button className="btn btn-sm" onClick={() => p.onReopen(t)}>Reopen</button>}
      </div>

      <div className="meta">
        <span>Time in: {p.timeIn ? fmtDuration(p.timeIn) : "none yet"}{running ? " (timer running)" : ""}</span>
        <span>Created: {fmtDateTime(t.created_at)}</span>
        {t.today_at && <span>Picked for today: {fmtDateTime(t.today_at)}</span>}
        {t.completed_at && <span>Completed: {fmtDateTime(t.completed_at)}</span>}
      </div>
    </section>
  );
}

function statusLabel(s: Task["status"]) {
  return { active: "Active", today: "Today", review: "In review", done: "Done" }[s];
}
