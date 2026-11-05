import type { Attendance, Client, Profile, Project, Task, TimeLog } from "./types";
import { todayISO } from "./util";

// Sample data used only when Supabase keys are missing (demo mode).
const day = 86400000;
const hour = 3600000;
const now = Date.now();
const iso = (offsetMs: number) => new Date(now + offsetMs).toISOString();
const dateIn = (days: number) => todayISO(new Date(now + days * day));

export const demoProfiles: Profile[] = [
  { id: "p-vy", auth_id: null, email: "demo.manager@uncvrd.com", name: "Demo Manager", job_role: "Administrative, Project Management", is_manager: true },
  { id: "p-aaron", auth_id: null, email: "aaron@uncvrd.com", name: "Aaron", job_role: "Graphic Design", is_manager: false },
  { id: "p-bao", auth_id: null, email: "bao@uncvrd.com", name: "Bao", job_role: "Product Development", is_manager: false },
];

export const demoProjects: Project[] = [
  { id: "pr-tkl", name: "TKL Fulfillment", parent_id: null, archived: false },
  { id: "pr-tkl-mi", name: "Monthly Issue", parent_id: "pr-tkl", archived: false },
  { id: "pr-kit", name: "KIT Drone Zone", parent_id: null, archived: false },
  { id: "pr-tvn", name: "TVN QDay", parent_id: null, archived: false },
  { id: "pr-misc", name: "Miscellaneous", parent_id: null, archived: false },
];

export const demoClients: Client[] = [
  { id: "c-misc", name: "Miscellaneous", archived: false },
  { id: "c-tkl", name: "TKL", archived: false },
];

let order = 1;
function t(p: Partial<Task> & { id: string; title: string }): Task {
  return {
    project_id: "pr-misc",
    client_id: "c-misc",
    job_role: "Administrative",
    assignee_id: "p-vy",
    created_by: "p-vy",
    tier: "need",
    priority: 3,
    difficulty: "MOD",
    htc: 0.25,
    progress: 0,
    status: "today",
    notes: null,
    start_date: null,
    due_date: null,
    repeat: "none",
    explanation_url: null,
    sort_order: order++,
    spawned_from: null,
    created_at: iso(-10 * day),
    updated_at: iso(-1 * day),
    today_at: iso(-2 * hour),
    completed_at: null,
    ...p,
  };
}

export const demoTasks: Task[] = [
  t({ id: "t1", title: "Have Chad follow up with Rob about script", project_id: "pr-kit", priority: 1.5 }),
  t({ id: "t2", title: "Send thumbnail to Rob with VSL when done", project_id: "pr-tkl", priority: 2.5 }),
  t({ id: "t3", title: "Have Jan check TVN funnel after pages ready", project_id: "pr-tvn", priority: 2.5, today_at: iso(-1 * day) }),
  t({ id: "t4", title: "Recap client projects", repeat: "daily", htc: 0.5 }),
  t({ id: "t5", title: "Night manager call", repeat: "daily", htc: 1.25 }),
  t({ id: "t6", title: "Check emails and team progress", repeat: "daily", htc: 0.5 }),
  t({ id: "t7", title: "Agenda for call with Jan", progress: 66, htc: 0.5 }),
  t({ id: "t8", title: "Send Jan agenda", difficulty: "SIMP", htc: 0.25 }),
  t({ id: "t9", title: "Check royalty report", tier: "nice" }),
  t({ id: "t10", title: "Check in with Jan about pre-rebill automation", tier: "nice" }),
  t({ id: "t11", title: "Check in with Scott about PAY 20 deadline", tier: "nice" }),
  t({ id: "t12", title: "Call BOA", status: "active", today_at: null, difficulty: "COMP", htc: 4.5, progress: 62 }),
  t({ id: "t13", title: "Wednesday call with client", status: "active", today_at: null, repeat: "weekly", due_date: dateIn(6), start_date: dateIn(6), htc: 0.75 }),
  t({ id: "t14", title: "Set up KIT webinar", status: "review", today_at: null, progress: 100, completed_at: iso(-3 * hour), htc: 0.75 }),
  t({ id: "t15", title: "Night manager call", status: "review", today_at: null, progress: 100, repeat: "daily", completed_at: iso(-20 * hour), htc: 1.25 }),
  t({ id: "t16", title: "Design TAC monthly issue", assignee_id: "p-aaron", job_role: "Graphic Design", project_id: "pr-tkl-mi" }),
];

export const demoLogs: TimeLog[] = [
  { id: "l1", task_id: "t6", user_id: "p-vy", started_at: iso(-3 * hour), ended_at: iso(-2.6 * hour) },
  { id: "l2", task_id: "t7", user_id: "p-vy", started_at: iso(-2 * hour), ended_at: iso(-1.98 * hour) },
  { id: "l3", task_id: "t12", user_id: "p-vy", started_at: iso(-2 * day), ended_at: iso(-2 * day + 3.3 * hour) },
  { id: "l4", task_id: "t14", user_id: "p-vy", started_at: iso(-4 * hour), ended_at: iso(-3.3 * hour) },
];

export const demoAttendance: Attendance[] = [
  { id: "a1", user_id: "p-vy", kind: "work", started_at: iso(-4 * hour), ended_at: null },
];
