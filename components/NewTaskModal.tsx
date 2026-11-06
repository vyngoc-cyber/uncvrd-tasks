"use client";

import { useState } from "react";
import type { Difficulty, Profile, Repeat, Tier } from "@/lib/types";
import { DIFFICULTIES, HTC_PRESETS, REPEAT_LABEL, fmtHours, priorityLabel } from "@/lib/util";
import { useStore } from "@/lib/store";
import { Modal } from "./Dialogs";

interface Props {
  defaultAssignee: Profile;
  projectOptions: { id: string; path: string }[];
  onClose: () => void;
}

export function NewTaskModal({ defaultAssignee, projectOptions, onClose }: Props) {
  const { me, profiles, clients, createTasks, pushToast } = useStore();
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [projectId, setProjectId] = useState("");
  const [clientId, setClientId] = useState("");
  const [jobRole, setJobRole] = useState(defaultAssignee.job_role?.split(",")[0]?.trim() ?? "");
  const [assignee, setAssignee] = useState(defaultAssignee.id);
  const [priority, setPriority] = useState("3.0");
  const [tier, setTier] = useState<Tier | "later">("need");
  const [difficulty, setDifficulty] = useState<Difficulty>("SIMP");
  const [htc, setHtc] = useState("0.25");
  const [repeat, setRepeat] = useState<Repeat>("none");
  const [due, setDue] = useState("");
  const [busy, setBusy] = useState(false);

  const prio = Number(priority.replace(",", "."));
  const prioOk = !isNaN(prio) && prio >= 1 && prio <= 4.9;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !prioOk) return;
    setBusy(true);
    const n = await createTasks([{
      title: title.trim(),
      notes: notes.trim() || null,
      project_id: projectId || null,
      client_id: clientId || null,
      job_role: jobRole.trim() || null,
      assignee_id: assignee,
      priority: Math.round(prio * 10) / 10,
      tier: tier === "later" ? "need" : tier,
      difficulty,
      htc: htc === "" ? null : Number(htc),
      repeat,
      due_date: due || null,
      start_date: repeat !== "none" ? due || null : null,
      status: tier === "later" ? "active" : "today",
    }]);
    setBusy(false);
    if (n) {
      pushToast({ message: "Task created" });
      onClose();
    }
  }

  return (
    <Modal title="New task" onClose={onClose}>
      <form onSubmit={submit} className="stack">
        <div className="field">
          <label htmlFor="n-title">Title</label>
          <input id="n-title" className="input" maxLength={80} value={title} onChange={(e) => setTitle(e.target.value)} autoFocus required />
        </div>
        <div className="field">
          <label htmlFor="n-notes">Description</label>
          <textarea id="n-notes" className="textarea" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        <div className="two">
          <div className="field">
            <label htmlFor="n-proj">Project</label>
            <select id="n-proj" className="select" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              <option value="">None</option>
              {projectOptions.map((o) => <option key={o.id} value={o.id}>{o.path}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="n-client">Client</label>
            <select id="n-client" className="select" value={clientId} onChange={(e) => setClientId(e.target.value)}>
              <option value="">None</option>
              {clients.filter((c) => !c.archived).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="n-role">Area (job role)</label>
            <input id="n-role" className="input" value={jobRole} onChange={(e) => setJobRole(e.target.value)} />
          </div>
          {me?.is_manager ? (
            <div className="field">
              <label htmlFor="n-asg">Assignee</label>
              <select id="n-asg" className="select" value={assignee} onChange={(e) => setAssignee(e.target.value)}>
                {profiles.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>
          ) : <div />}
          <div className="field">
            <label htmlFor="n-prio">Priority (1.0 - 4.9)</label>
            <input id="n-prio" className="input" inputMode="decimal" value={priority} onChange={(e) => setPriority(e.target.value)} />
            <span className="band">{prioOk ? priorityLabel(prio) : "Enter 1.0 to 4.9"}</span>
          </div>
          <div className="field">
            <label htmlFor="n-diff">Complexity</label>
            <select id="n-diff" className="select" value={difficulty}
              onChange={(e) => {
                const d = e.target.value as Difficulty;
                setDifficulty(d);
                setHtc(String(DIFFICULTIES.find((x) => x.value === d)!.hours));
              }}>
              {DIFFICULTIES.map((d) => <option key={d.value} value={d.value}>{d.value}: {d.text.replace("Tasks that take ", "")}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="n-htc">HTC</label>
            <select id="n-htc" className="select" value={htc} onChange={(e) => setHtc(e.target.value)}>
              <option value="">–</option>
              {HTC_PRESETS.map((h) => <option key={h} value={h}>{fmtHours(h)}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="n-rep">Repeat</label>
            <select id="n-rep" className="select" value={repeat} onChange={(e) => setRepeat(e.target.value as Repeat)}>
              {(Object.keys(REPEAT_LABEL) as Repeat[]).map((r) => <option key={r} value={r}>{REPEAT_LABEL[r]}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="n-due">Due date</label>
            <input id="n-due" className="input" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
          </div>
        </div>
        <div className="field">
          <label>Add to</label>
          <div className="tier-toggle three" role="radiogroup" aria-label="Where this task goes">
            {([["need", "Need-to-have"], ["nice", "Nice-to-have"], ["later", "Later (active list)"]] as const).map(([v, label]) => (
              <button key={v} type="button" role="radio" aria-checked={tier === v} className={tier === v ? "on" : ""} onClick={() => setTier(v)}>{label}</button>
            ))}
          </div>
        </div>
        <div className="modal-foot">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={busy || !title.trim() || !prioOk}>Create task</button>
        </div>
      </form>
    </Modal>
  );
}
