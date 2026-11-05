import type { Project, Task, TimeLog } from "./types";

export const WORKDAY_HOURS = 8;
export const PRIORITY_LABEL = { need: "Need-to-have", nice: "Nice-to-have" } as const;

export function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export function isSameLocalDay(iso: string, ref = new Date()): boolean {
  const d = new Date(iso);
  return d.getFullYear() === ref.getFullYear() && d.getMonth() === ref.getMonth() && d.getDate() === ref.getDate();
}

/** A "today" task picked on an earlier day and still not finished. */
export function carriedFrom(t: Task): string | null {
  if (t.status !== "today" || !t.today_at) return null;
  if (new Date(t.today_at) >= startOfToday()) return null;
  return new Date(t.today_at).toLocaleDateString(undefined, { day: "numeric", month: "short" });
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

export function fmtDuration(ms: number): string {
  const mins = Math.round(ms / 60000);
  if (mins <= 0) return "0h";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  return m ? `${h}h ${m}m` : `${h}h`;
}

export function fmtHours(h: number | null | undefined): string {
  if (h === null || h === undefined || isNaN(Number(h))) return "";
  const n = Number(h);
  return `${Number.isInteger(n) ? n : n.toFixed(1)}h`;
}

export function fmtDateTime(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleString(undefined, { day: "numeric", month: "short", ...(sameYear ? {} : { year: "2-digit" }), hour: "2-digit", minute: "2-digit", hour12: false });
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
