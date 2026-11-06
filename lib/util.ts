import type { Difficulty, Project, Repeat, Task, TimeLog } from "./types";

export const WORKDAY_HOURS = 8;

/** Colour state of the progress thumb: not started, being worked on now, started but paused, finished. */
export type ProgressState = "idle" | "running" | "paused" | "done";
export function progressState(t: Task, progress: number, running: boolean): ProgressState {
  if (t.status === "review" || t.status === "done" || progress >= 100) return "done";
  if (running) return "running";
  if (progress > 0) return "paused";
  return "idle";
}
export const PROGRESS_STATE_LABEL: Record<ProgressState, string> = {
  idle: "Not started",
  running: "Working on it now",
  paused: "Started, paused",
  done: "Finished",
};

export const PRIORITY_BANDS = [
  { value: 1, label: "Game over" },
  { value: 2, label: "Major loss" },
  { value: 3, label: "Major gain" },
  { value: 4, label: "Nice-to-have" },
] as const;

export function priorityLabel(p: number): string {
  const band = Math.min(4, Math.max(1, Math.floor(p)));
  return PRIORITY_BANDS[band - 1]!.label;
}

export const DIFFICULTIES: { value: Difficulty; text: string; hours: number }[] = [
  { value: "SIMP", text: "Tasks that take less than 1h, usually 15min", hours: 0.25 },
  { value: "MOD", text: "Tasks that take at least 1h but less than 2h30min", hours: 1.5 },
  { value: "COMP", text: "Tasks that take multiple hours, generally 3h to 5h", hours: 4 },
  { value: "SUPC", text: "Tasks that take 6h or more, generally 8h", hours: 8 },
];

export const HTC_PRESETS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3, 4, 5, 6, 8];

export const REPEAT_LABEL: Record<Repeat, string> = { none: "Does not repeat", daily: "Daily", weekly: "Weekly", monthly: "Monthly" };

/** Local "today" as YYYY-MM-DD. */
export function todayISO(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/** A "today" task picked on an earlier day and still not finished. */
export function carriedFrom(t: Task): string | null {
  if (t.status !== "today" || !t.today_at) return null;
  if (new Date(t.today_at) >= startOfToday()) return null;
  return new Date(t.today_at).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

/** "DL 6d" style deadline badge, or null. */
export function deadlineBadge(t: Task): { text: string; urgent: boolean } | null {
  if (!t.due_date || t.status === "review" || t.status === "done") return null;
  const [y, m, d] = t.due_date.split("-").map(Number);
  const due = new Date(y!, m! - 1, d!);
  const days = Math.round((due.getTime() - startOfToday().getTime()) / 86400000);
  if (days < 0) return { text: `DL ${Math.abs(days)}d late`, urgent: true };
  if (days === 0) return { text: "DL today", urgent: true };
  return { text: `DL ${days}d`, urgent: days <= 2 };
}

export function projectPath(id: string | null, byId: Map<string, Project>): string {
  if (!id) return "";
  const parts: string[] = [];
  let cur = byId.get(id);
  let guard = 0;
  while (cur && guard++ < 6) {
    parts.unshift(cur.name);
    cur = cur.parent_id ? byId.get(cur.parent_id) : undefined;
  }
  return parts.join(" \\ ");
}

export function logMs(l: TimeLog, from?: Date, now = Date.now()): number {
  const s = new Date(l.started_at).getTime();
  const e = l.ended_at ? new Date(l.ended_at).getTime() : now;
  const start = from ? Math.max(s, from.getTime()) : s;
  return Math.max(0, e - start);
}

function fmtMinutes(mins: number): string {
  if (mins <= 0) return "0min";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}min`;
  return m ? `${h}h${m}min` : `${h}h`;
}

/** Taskr-style durations: 4min, 1h3min, 2h */
export function fmtDuration(ms: number): string {
  return fmtMinutes(Math.round(ms / 60000));
}

export function fmtHours(h: number | null | undefined): string {
  if (h === null || h === undefined || isNaN(Number(h))) return "";
  return fmtMinutes(Math.round(Number(h) * 60));
}

/** Parses 15min, 1h15min, 1h30, 90m, 1.5 (hours). */
export function parseHtc(raw: string): number | null {
  const s = raw.trim().toLowerCase().replace(/\s+/g, "");
  if (!s) return null;
  if (/^\d+(\.\d+)?$/.test(s)) return Number(s);
  const m = s.match(/^(?:(\d+(?:\.\d+)?)h)?(?:(\d+)(?:m|min|mins)?)?$/);
  if (!m || (!m[1] && !m[2])) return NaN;
  return Number(m[1] ?? 0) + Number(m[2] ?? 0) / 60;
}

export function fmtDateTime(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${String(d.getFullYear()).slice(2)}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

export function uid(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function nextOccurrence(repeat: Repeat, from: string | null): string {
  const base = from && from > todayISO() ? new Date(from + "T00:00:00") : startOfToday();
  if (repeat === "daily") base.setDate(base.getDate() + 1);
  else if (repeat === "weekly") base.setDate(base.getDate() + 7);
  else base.setMonth(base.getMonth() + 1);
  return todayISO(base);
}
