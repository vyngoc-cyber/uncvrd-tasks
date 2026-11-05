import type { Profile, Project, Task, TimeLog } from "./types";

// Sample data used only when Supabase keys are missing (demo mode).
const day = 86400000;
const now = Date.now();
const iso = (offsetMs: number) => new Date(now + offsetMs).toISOString();

export const demoProfiles: Profile[] = [
  { id: "p-aaron", auth_id: null, email: "aaron@uncvrd.com", name: "Aaron", job_role: "Graphic Design", is_manager: false },
  { id: "p-mgr", auth_id: null, email: "manager@uncvrd.com", name: "Demo Manager", job_role: "Operations", is_manager: true },
  { id: "p-bao", auth_id: null, email: "bao@uncvrd.com", name: "Bao", job_role: "Product Development", is_manager: false },
];

export const demoProjects: Project[] = [
  { id: "pr-tkl", name: "TKL Fulfillment", parent_id: null, archived: false },
  { id: "pr-tkl-mi", name: "Monthly Issue", parent_id: "pr-tkl", archived: false },
  { id: "pr-tkl-wl", name: "Watch List", parent_id: "pr-tkl", archived: false },
  { id: "pr-tkl-mm", name: "Mid-month report", parent_id: "pr-tkl", archived: false },
  { id: "pr-tac", name: "TAC Fulfillment", parent_id: null, archived: false },
  { id: "pr-tac-mi", name: "TAC Monthly Issue", parent_id: "pr-tac", archived: false },
  { id: "pr-kit", name: "KIT Drone Zone", parent_id: null, archived: false },
  { id: "pr-tvn", name: "TVN QDay", parent_id: null, archived: false },
  { id: "pr-misc", name: "Miscellaneous", parent_id: null, archived: false },
];

function t(p: Partial<Task> & { id: string; title: string }): Task {
  return {
    project_id: null,
    job_role: "Graphic Design",
    assignee_id: "p-aaron",
    created_by: "p-mgr",
    priority: "need",
    difficulty: "SIMP",
    htc: null,
    progress: 0,
    status: "active",
    notes: null,
    created_at: iso(-20 * day),
    updated_at: iso(-1 * day),
    today_at: null,
    completed_at: null,
    ...p,
  };
}

export const demoTasks: Task[] = [
  t({ id: "t1", title: "November TKL", project_id: "pr-tkl", difficulty: "MOD", htc: 2, progress: 40, status: "today", today_at: iso(-2 * 3600000) }),
  t({ id: "t2", title: "KIT - 4 Drone Reports", project_id: "pr-kit", difficulty: "MOD", htc: 3, progress: 60, status: "today", today_at: iso(-1 * day) }),
  t({ id: "t3", title: "Update PIP report", project_id: "pr-misc", job_role: "Administrative", htc: 1, progress: 10, status: "today", today_at: iso(-1 * 3600000), priority: "nice" }),
  t({ id: "t4", title: "Design TAC monthly issue", project_id: "pr-tac-mi", htc: 2, progress: 0 }),
  t({ id: "t5", title: "Edit Top 3 video", project_id: "pr-tkl", htc: 1.5, progress: 20, priority: "nice" }),
  t({ id: "t6", title: "Design TVN Qday report", project_id: "pr-tvn", difficulty: "MOD", htc: 4, progress: 0 }),
  t({ id: "t7", title: "Design monthly issue", project_id: "pr-tkl-mi", progress: 100, status: "review", completed_at: iso(-3 * day) }),
  t({ id: "t8", title: "Edit video", project_id: "pr-tkl-wl", progress: 100, status: "review", completed_at: iso(-5 * day) }),
  t({ id: "t9", title: "Design TKL mid month report", project_id: "pr-tkl-mm", difficulty: "MOD", htc: 1, progress: 100, status: "review", completed_at: iso(-8 * day) }),
  t({ id: "t10", title: "TKL Monthly", project_id: "pr-tkl-mi", difficulty: "MOD", htc: 2, progress: 100, status: "done", completed_at: iso(-12 * day) }),
  t({ id: "t11", title: "Tech pack revisions, SS27 jacket", project_id: "pr-misc", job_role: "Product Development", assignee_id: "p-bao", htc: 3, status: "today", today_at: iso(-1 * 3600000) }),
];

export const demoLogs: TimeLog[] = [
  { id: "l1", task_id: "t1", user_id: "p-aaron", started_at: iso(-2 * 3600000), ended_at: iso(-1.25 * 3600000) },
  { id: "l2", task_id: "t2", user_id: "p-aaron", started_at: iso(-1 * day), ended_at: iso(-1 * day + 2.5 * 3600000) },
  { id: "l3", task_id: "t6", user_id: "p-aaron", started_at: iso(-4 * day), ended_at: iso(-4 * day + 1 * 3600000) },
];
