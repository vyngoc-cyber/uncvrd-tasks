"use client";

import { useEffect, useState } from "react";
import type { Client, Difficulty, Profile, Repeat, Task } from "@/lib/types";
import { DIFFICULTIES, HTC_PRESETS, PROGRESS_STATE_LABEL, REPEAT_LABEL, carriedFrom, progressState, fmtDateTime, fmtHours, priorityLabel } from "@/lib/util";
import { useStore } from "@/lib/store";

interface Props {
  task: Task;
  projectOptions: { id: string; path: string }[];
  clients: Client[];
  profiles: Profile[];
  profilesById: Map<string, Profile>;
  timeIn: number;
  running: boolean;
  isManager: boolean;
  canTime: boolean;
  onClose: () => void;
  onComplete: (t: Task) => void;
  onNewProject: (t: Task) => void;
  onNewClient: (t: Task) => void;
}

export function TaskDetail({ task: t, ...p }: Props) {
  const { updateTask, startTimer, stopTimer } = useStore();
  const [draft, setDraft] = useState(t);
  useEffect(() => setDraft(t), [t]);

  const save = (patch: Partial<Task>) => {
    const changed = Object.entries(patch).some(([k, v]) => t[k as keyof Task] !== v);
    if (changed) updateTask(t.id, patch);
  };
  const carried = carriedFrom(t);
  const closed = t.status === "review" || t.status === "done";
  const assigner = t.created_by ? p.profilesById.get(t.created_by)?.name : null;
  const clientName = t.client_id ? p.clients.find((c) => c.id === t.client_id)?.name : null;
  // Need/Nice-to-have = put it on today's list in that band
  const setTier = (tier: Task["tier"]) =>
    save(t.status === "active" || t.status === "hold" ? { tier, status: "today", today_at: new Date().toISOString() } : { tier });
  const pstate = progressState(t, draft.progress, p.running);

  return (
    <section className="detail" aria-label="Task details">
      <div className="detail-head">
        <span className="pill">{{ active: "Active", today: "Today", hold: "On hold", review: "In review", done: "Done" }[t.status]}</span>
        {carried && <span className="sub">Carried from {carried}</span>}
        <button className="btn btn-ghost btn-sm" style={{ marginLeft: "auto" }} onClick={p.onClose} aria-label="Close details">✕</button>
      </div>

      <Field label="Description" htmlFor="d-notes">
        <textarea id="d-notes" className="textarea" value={draft.notes ?? ""} placeholder="What needs to happen, links, context…"
          onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
          onBlur={() => save({ notes: draft.notes?.trim() || null })} />
      </Field>

      <Field label="Title" htmlFor="d-title" aside={`${draft.title.length}/80`}>
        <input id="d-title" className="input" maxLength={80} value={draft.title}
          onChange={(e) => setDraft({ ...draft, title: e.target.value })}
          onBlur={() => draft.title.trim() && save({ title: draft.title.trim() })} />
      </Field>

      <Field label="Area (job role)" htmlFor="d-role">
        <input id="d-role" className="input" value={draft.job_role ?? ""}
          onChange={(e) => setDraft({ ...draft, job_role: e.target.value })}
          onBlur={() => save({ job_role: draft.job_role?.trim() || null })} />
      </Field>

      <Field label="Project" htmlFor="d-proj">
        <select id="d-proj" className="select" value={t.project_id ?? ""}
          onChange={(e) => (e.target.value === "__new" ? p.onNewProject(t) : save({ project_id: e.target.value || null }))}>
          <option value="">None</option>
          {p.projectOptions.map((x) => <option key={x.id} value={x.id}>{x.path}</option>)}
          {p.isManager && <option value="__new">+ New project…</option>}
        </select>
      </Field>

      <Field label="Client" htmlFor="d-client">
        <select id="d-client" className="select" value={t.client_id ?? ""}
          onChange={(e) => (e.target.value === "__new" ? p.onNewClient(t) : save({ client_id: e.target.value || null }))}>
          <option value="">None</option>
          {p.clients.filter((c) => !c.archived).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          {p.isManager && <option value="__new">+ New client…</option>}
        </select>
      </Field>

      {p.isManager ? (
        <Field label="Assignee" htmlFor="d-asg">
          <select id="d-asg" className="select" value={t.assignee_id ?? ""} onChange={(e) => save({ assignee_id: e.target.value || null })}>
            <option value="">Unassigned</option>
            {p.profiles.map((u) => <option key={u.id} value={u.id}>{u.name}{u.job_role ? `: ${u.job_role}` : ""}</option>)}
          </select>
        </Field>
      ) : null}

      {assigner && (
        <Field label="Assigner">
          <div className="readonly">{assigner}</div>
        </Field>
      )}

      <div className="two">
        <Field label="Priority (1.0 - 4.9)" htmlFor="d-prio">
          <input id="d-prio" className="input" type="number" min={1} max={4.9} step={0.1} value={draft.priority}
            onChange={(e) => setDraft({ ...draft, priority: Number(e.target.value) })}
            onBlur={() => {
              const v = Math.min(4.9, Math.max(1, Math.round((draft.priority || 3) * 10) / 10));
              setDraft({ ...draft, priority: v });
              save({ priority: v });
            }} />
          <span className="band">{priorityLabel(draft.priority || 3)}</span>
        </Field>
        <Field label="Complexity" htmlFor="d-diff">
          <select id="d-diff" className="select" value={t.difficulty} onChange={(e) => save({ difficulty: e.target.value as Difficulty })}>
            {DIFFICULTIES.map((d) => <option key={d.value} value={d.value}>{d.value}</option>)}
          </select>
        </Field>
        <Field label="Start date" htmlFor="d-start">
          <input id="d-start" className="input" type="date" value={t.start_date ?? ""} onChange={(e) => save({ start_date: e.target.value || null })} />
        </Field>
        <Field label="Due date" htmlFor="d-due">
          <input id="d-due" className="input" type="date" value={t.due_date ?? ""} onChange={(e) => save({ due_date: e.target.value || null })} />
        </Field>
        <Field label="Repeat" htmlFor="d-rep">
          <select id="d-rep" className="select" value={t.repeat} onChange={(e) => save({ repeat: e.target.value as Repeat })}>
            {(Object.keys(REPEAT_LABEL) as Repeat[]).map((r) => <option key={r} value={r}>{REPEAT_LABEL[r]}</option>)}
          </select>
        </Field>
        <Field label="HTC" htmlFor="d-htc">
          <select id="d-htc" className="select" value={t.htc ?? ""} onChange={(e) => save({ htc: e.target.value === "" ? null : Number(e.target.value) })}>
            <option value="">–</option>
            {t.htc !== null && !HTC_PRESETS.includes(t.htc) && <option value={t.htc}>{fmtHours(t.htc)}</option>}
            {HTC_PRESETS.map((h) => <option key={h} value={h}>{fmtHours(h)}</option>)}
          </select>
        </Field>
      </div>

      <Field label="Explanation URL" htmlFor="d-url">
        <div className="with-btn">
          <input id="d-url" className="input" type="url" placeholder="https://…" value={draft.explanation_url ?? ""}
            onChange={(e) => setDraft({ ...draft, explanation_url: e.target.value })}
            onBlur={() => save({ explanation_url: draft.explanation_url?.trim() || null })} />
          {t.explanation_url && <a className="btn btn-sm" href={t.explanation_url} target="_blank" rel="noreferrer">Open</a>}
        </div>
      </Field>

      <Field label={`Status ${draft.progress}%`} htmlFor="d-prog">
        <input id="d-prog" type="range" min={0} max={100} step={5} value={draft.progress} disabled={closed}
          className={`pstate-${pstate}`} title={PROGRESS_STATE_LABEL[pstate]}
          style={{ ["--pct" as string]: `${draft.progress}%` }}
          onChange={(e) => setDraft({ ...draft, progress: Number(e.target.value) })}
          onPointerUp={() => (draft.progress >= 100 ? p.onComplete(t) : save({ progress: draft.progress }))}
          onKeyUp={() => (draft.progress >= 100 ? p.onComplete(t) : save({ progress: draft.progress }))} />
      </Field>

      <div className="tier-toggle" role="radiogroup" aria-label="Need or nice to have">
        <button role="radio" aria-checked={t.status === "today" && t.tier === "need"} className={t.status === "today" && t.tier === "need" ? "on" : ""} onClick={() => setTier("need")}>Need-to-have</button>
        <button role="radio" aria-checked={t.status === "today" && t.tier === "nice"} className={t.status === "today" && t.tier === "nice" ? "on" : ""} onClick={() => setTier("nice")}>Nice-to-have</button>
      </div>

      <div className="meta">
        Logged {(p.timeIn / 3600000).toFixed(2)}h · Est {t.htc ? `${t.htc}h` : "–"}{clientName ? ` · Client: ${clientName}` : ""}
        <br />
        Created {fmtDateTime(t.created_at)}{t.completed_at ? ` · Completed ${fmtDateTime(t.completed_at)}` : ""}
      </div>

      <div className="detail-actions">
        {p.canTime && !closed && (
          p.running
            ? <button className="btn" onClick={() => stopTimer()}>Stop timer</button>
            : <button className="btn" onClick={() => startTimer(t.id)}>Start timer</button>
        )}
        {t.status === "today" && <button className="btn" onClick={() => save({ status: "active", today_at: null })}>Stop working on</button>}
        {t.status === "hold" && <button className="btn" onClick={() => save({ status: "active" })}>Resume</button>}
        {t.status === "review" && p.isManager && <button className="btn" onClick={() => save({ status: "done" })}>Approve</button>}
        {closed && <button className="btn" onClick={() => save({ status: "active", completed_at: null, progress: Math.min(t.progress, 90) })}>Reopen</button>}
      </div>
      {!closed && (
        <button className="btn btn-primary btn-block" onClick={() => p.onComplete(t)}>
          {p.isManager ? "Done" : "Done, send to review"}
        </button>
      )}
    </section>
  );
}

function Field({ label, htmlFor, aside, children }: { label: string; htmlFor?: string; aside?: string; children: React.ReactNode }) {
  return (
    <div className="field">
      <div className="field-label">
        <label htmlFor={htmlFor}>{label}</label>
        {aside && <span>{aside}</span>}
      </div>
      {children}
    </div>
  );
}
