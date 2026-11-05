"use client";

import { useState } from "react";
import type { Difficulty, Priority, Profile, Project } from "@/lib/types";
import { projectPath } from "@/lib/util";
import { useStore } from "@/lib/store";

interface Props {
  defaultAssignee: Profile;
  projects: Project[];
  projectsById: Map<string, Project>;
  onClose: () => void;
}

export function NewTaskModal({ defaultAssignee, projects, projectsById, onClose }: Props) {
  const { me, profiles, createTasks, pushToast } = useStore();
  const [title, setTitle] = useState("");
  const [projectId, setProjectId] = useState("");
  const [jobRole, setJobRole] = useState(defaultAssignee.job_role ?? "");
  const [assignee, setAssignee] = useState(defaultAssignee.id);
  const [priority, setPriority] = useState<Priority>("need");
  const [difficulty, setDifficulty] = useState<Difficulty>("SIMP");
  const [htc, setHtc] = useState("");
  const [notes, setNotes] = useState("");
  const [today, setToday] = useState(true);
  const [busy, setBusy] = useState(false);

  const opts = projects
    .filter((x) => !x.archived)
    .map((x) => ({ id: x.id, path: projectPath(x.id, projectsById) }))
    .sort((a, b) => a.path.localeCompare(b.path));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setBusy(true);
    const n = await createTasks([
      {
        title: title.trim(),
        project_id: projectId || null,
        job_role: jobRole.trim() || null,
        assignee_id: assignee,
        priority,
        difficulty,
        htc: htc === "" ? null : Number(htc),
        notes: notes.trim() || null,
        status: today ? "today" : "active",
      },
    ]);
    setBusy(false);
    if (n) {
      pushToast({ message: "Task created" });
      onClose();
    }
  }

  return (
    <div className="overlay" onClick={onClose}>
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={submit} aria-label="New task">
        <h2>New task</h2>
        <div className="field">
          <label htmlFor="n-title">Title</label>
          <input id="n-title" className="input" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus required />
        </div>
        <div className="field">
          <label htmlFor="n-proj">Project</label>
          <select id="n-proj" className="select" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            <option value="">None</option>
            {opts.map((o) => <option key={o.id} value={o.id}>{o.path}</option>)}
          </select>
        </div>
        <div className="two">
          <div className="field">
            <label htmlFor="n-role">Job role</label>
            <input id="n-role" className="input" value={jobRole} onChange={(e) => setJobRole(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="n-htc">HTC (hours)</label>
            <input id="n-htc" className="input" type="number" min={0} step={0.5} value={htc} onChange={(e) => setHtc(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="n-prio">Priority</label>
            <select id="n-prio" className="select" value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
              <option value="need">Need-to-have</option>
              <option value="nice">Nice-to-have</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="n-diff">Difficulty</label>
            <select id="n-diff" className="select" value={difficulty} onChange={(e) => setDifficulty(e.target.value as Difficulty)}>
              <option value="SIMP">SIMP</option>
              <option value="MOD">MOD</option>
            </select>
          </div>
        </div>
        {me?.is_manager && (
          <div className="field">
            <label htmlFor="n-asg">Assignee</label>
            <select id="n-asg" className="select" value={assignee} onChange={(e) => setAssignee(e.target.value)}>
              {profiles.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>
        )}
        <div className="field">
          <label htmlFor="n-notes">Notes</label>
          <textarea id="n-notes" className="textarea" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input type="checkbox" checked={today} onChange={(e) => setToday(e.target.checked)} />
          Work on it today
        </label>
        <div className="modal-foot">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={busy || !title.trim()}>Create task</button>
        </div>
      </form>
    </div>
  );
}
