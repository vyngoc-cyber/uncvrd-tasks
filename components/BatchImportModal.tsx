"use client";

import { useMemo, useState } from "react";
import Papa from "papaparse";
import type { Difficulty, NewTask, Profile, Project, Tier } from "@/lib/types";
import { parseHtc, projectPath } from "@/lib/util";
import { Modal } from "./Dialogs";
import { useStore } from "@/lib/store";

interface Props {
  defaultAssignee: Profile;
  projects: Project[];
  projectsById: Map<string, Project>;
  onClose: () => void;
}

const FIELDS = ["title", "project", "job_role", "priority", "difficulty", "htc", "assignee", "notes", "tier"] as const;
type Field = (typeof FIELDS)[number];

const ALIASES: Record<string, Field> = {
  title: "title", task: "title", name: "title",
  project: "project",
  "job role": "job_role", job_role: "job_role", role: "job_role",
  priority: "priority", prio: "priority",
  difficulty: "difficulty", diff: "difficulty",
  htc: "htc", hours: "htc", "hours to complete": "htc",
  assignee: "assignee", "assignee email": "assignee", assignee_email: "assignee", email: "assignee",
  notes: "notes", note: "notes", description: "notes",
  tier: "tier", "need/nice": "tier", type: "tier",
};

interface Parsed {
  task: NewTask;
  problems: string[];
  projectLabel: string;
  assigneeLabel: string;
}

export function BatchImportModal({ defaultAssignee, projects, projectsById, onClose }: Props) {
  const { me, profiles, createTasks, pushToast } = useStore();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  const projectIndex = useMemo(() => {
    const byPath = new Map<string, string>();
    const byLeaf = new Map<string, string[]>();
    for (const p of projects) {
      byPath.set(normalize(projectPath(p.id, projectsById)), p.id);
      const leaf = normalize(p.name);
      byLeaf.set(leaf, [...(byLeaf.get(leaf) ?? []), p.id]);
    }
    return { byPath, byLeaf };
  }, [projects, projectsById]);

  const rows: Parsed[] = useMemo(() => {
    if (!text.trim()) return [];
    const res = Papa.parse<string[]>(text.trim(), { skipEmptyLines: true, delimiter: text.includes("\t") ? "\t" : "" });
    let data = res.data.map((r) => r.map((c) => (c ?? "").trim()));
    let cols: (Field | null)[] = [...FIELDS];
    const first = data[0]?.map((c) => ALIASES[c.toLowerCase()] ?? null) ?? [];
    if (first.includes("title")) {
      cols = first;
      data = data.slice(1);
    }
    return data.map((r) => {
      const get = (f: Field) => {
        const i = cols.indexOf(f);
        return i === -1 ? "" : (r[i] ?? "");
      };
      const problems: string[] = [];
      const title = get("title");
      if (!title) problems.push("missing title");

      const projRaw = get("project");
      let project_id: string | null = null;
      if (projRaw) {
        const key = normalize(projRaw);
        project_id = projectIndex.byPath.get(key) ?? null;
        if (!project_id) {
          const leaf = projectIndex.byLeaf.get(key);
          if (leaf?.length === 1) project_id = leaf[0]!;
          else problems.push(leaf ? "project name is ambiguous" : "unknown project");
        }
      }

      // priority column takes a number (1.0-4.9) or need/nice; tier column takes need/nice
      const prRaw = get("priority").trim().toLowerCase().replace(",", ".");
      const tierRaw = (get("tier") || (isNaN(Number(prRaw)) ? prRaw : "")).toLowerCase();
      const tier: Tier = tierRaw.startsWith("nice") ? "nice" : "need";
      let priority = 3;
      if (prRaw && !isNaN(Number(prRaw))) {
        priority = Number(prRaw);
        if (priority < 1 || priority > 4.9) {
          problems.push("priority must be 1.0-4.9");
          priority = 3;
        }
      }
      const dRaw = get("difficulty").toUpperCase();
      const difficulty: Difficulty = (["SIMP", "MOD", "COMP", "SUPC"] as const).find((d) => dRaw.startsWith(d)) ?? "SIMP";
      const htc = parseHtc(get("htc"));
      if (htc !== null && isNaN(htc)) problems.push("HTC not understood");

      let assignee = defaultAssignee;
      const aRaw = get("assignee").toLowerCase();
      if (aRaw && me?.is_manager) {
        const hit = profiles.find((u) => u.email === aRaw || u.name.toLowerCase() === aRaw);
        if (hit) assignee = hit;
        else problems.push("unknown assignee");
      }

      return {
        task: {
          title,
          project_id,
          job_role: get("job_role") || assignee.job_role || null,
          priority: Math.round(priority * 10) / 10,
          tier,
          difficulty,
          htc: htc !== null && isNaN(htc) ? null : htc,
          assignee_id: assignee.id,
          notes: get("notes") || null,
          status: "active",
        },
        problems,
        projectLabel: project_id ? projectPath(project_id, projectsById) : projRaw,
        assigneeLabel: assignee.name,
      };
    });
  }, [text, projectIndex, profiles, me, defaultAssignee, projectsById]);

  const blocking = rows.filter((r) => !r.task.title);
  const valid = rows.filter((r) => r.task.title);

  async function onFile(f: File | undefined) {
    if (!f) return;
    setText(await f.text());
  }

  async function submit() {
    setBusy(true);
    const n = await createTasks(valid.map((r) => r.task));
    setBusy(false);
    if (n) {
      pushToast({ message: `Imported ${n} task${n === 1 ? "" : "s"} as active` });
      onClose();
    }
  }

  return (
    <Modal title="Batch import" onClose={onClose} wide>
      <div className="stack">
        <p style={{ margin: 0, color: "var(--text-2)" }}>
          Paste rows from a spreadsheet or upload a CSV. Columns in this order, or use a header row:
          <br />
          <code>title, project, job role, priority (1.0-4.9 or need/nice), difficulty, HTC (e.g. 15min, 1h30), assignee email, description</code>
        </p>
        <textarea className="textarea" style={{ minHeight: 140, fontFamily: "ui-monospace, monospace", fontSize: 12 }}
          placeholder={"Design TAC monthly issue\tTAC Fulfillment \\ TAC Monthly Issue\tGraphic Design\tNeed\tSIMP\t2"}
          value={text} onChange={(e) => setText(e.target.value)} aria-label="Rows to import" />
        <div>
          <label className="btn btn-sm">
            Upload CSV
            <input type="file" accept=".csv,text/csv" hidden onChange={(e) => onFile(e.target.files?.[0])} />
          </label>
        </div>
        {rows.length > 0 && (
          <div style={{ overflowX: "auto" }}>
            <table className="preview">
              <thead>
                <tr><th>Title</th><th>Project</th><th>Role</th><th>Prio</th><th>Diff</th><th>HTC</th><th>Assignee</th><th>Check</th></tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i}>
                    <td>{r.task.title}</td>
                    <td>{r.projectLabel}</td>
                    <td>{r.task.job_role}</td>
                    <td>{r.task.priority?.toFixed(1)} {r.task.tier === "nice" ? "Nice" : "Need"}</td>
                    <td>{r.task.difficulty}</td>
                    <td>{r.task.htc ?? ""}</td>
                    <td>{r.assigneeLabel}</td>
                    <td className={r.problems.length ? "bad" : ""}>{r.problems.join(", ") || "OK"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.some((r) => r.problems.length) && (
              <p style={{ fontSize: 12, color: "var(--muted)" }}>
                Rows without a title are skipped. Unknown projects or assignees import with no project, or assigned to {defaultAssignee.name}.
              </p>
            )}
          </div>
        )}
        <div className="modal-foot">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={submit} disabled={busy || valid.length === 0}>
            Import {valid.length || ""} task{valid.length === 1 ? "" : "s"}
            {blocking.length ? ` (skip ${blocking.length})` : ""}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function normalize(s: string) {
  return s.toLowerCase().replace(/\s*[\\/>]\s*/g, " \\ ").replace(/\s+/g, " ").trim();
}
