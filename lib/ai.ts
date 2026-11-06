import type { Difficulty, Repeat, Task, Tier } from "./types";
import { todayISO } from "./util";

export interface AiOption {
  id: string;
  label: string;
}

export interface AiFillRequest {
  description: string;
  today: string;
  projects: AiOption[];
  clients: AiOption[];
  people: AiOption[];
}

export interface AiFillResult {
  title: string;
  job_role: string;
  project_id: string;
  client_id: string;
  assignee_id: string;
  priority: number;
  tier: Tier;
  difficulty: Difficulty;
  htc_minutes: number;
  due_date: string;
  repeat: Repeat;
  explanation_url: string;
  summary: string;
}

export async function requestAiFill(description: string, ctx: Omit<AiFillRequest, "description" | "today">): Promise<AiFillResult> {
  const d = new Date();
  const res = await fetch("/api/ai/fill", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      description,
      today: `${todayISO(d)} (${d.toLocaleDateString("en-US", { weekday: "long" })})`,
      ...ctx,
    } satisfies AiFillRequest),
  });
  const data = await res.json().catch(() => ({ error: "Unexpected response from the server." }));
  if (!res.ok) throw new Error(data.error ?? `AI request failed (${res.status})`);
  return data as AiFillResult;
}

/** Turns an AI result into a task patch. Empty answers leave the current value alone. */
export function aiResultToPatch(r: AiFillResult, opts: { canAssign: boolean }): Partial<Task> {
  const patch: Partial<Task> = {
    priority: r.priority,
    tier: r.tier,
    difficulty: r.difficulty,
    htc: Math.round((r.htc_minutes / 60) * 100) / 100,
    repeat: r.repeat,
  };
  if (r.title) patch.title = r.title;
  if (r.job_role) patch.job_role = r.job_role;
  if (r.project_id) patch.project_id = r.project_id;
  if (r.client_id) patch.client_id = r.client_id;
  if (opts.canAssign && r.assignee_id) patch.assignee_id = r.assignee_id;
  if (r.due_date) patch.due_date = r.due_date;
  if (r.due_date && r.repeat !== "none") patch.start_date = r.due_date;
  if (r.explanation_url) patch.explanation_url = r.explanation_url;
  return patch;
}
