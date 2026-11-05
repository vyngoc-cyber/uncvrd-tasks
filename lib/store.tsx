"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import type { Attendance, Client, NewTask, Profile, Project, Task, TimeLog } from "./types";
import { DEMO_MODE } from "./supabase/config";
import { getBrowserClient } from "./supabase/client";
import { demoAttendance, demoClients, demoLogs, demoProfiles, demoProjects, demoTasks } from "./demo";
import { nextOccurrence, uid } from "./util";

export interface Toast {
  id: string;
  message: string;
  action?: { label: string; run: () => void };
  ttl: number;
  tone?: "error";
}

type PunchAction = "in" | "break" | "back" | "out";

interface Store {
  ready: boolean;
  error: string | null;
  demo: boolean;
  me: Profile | null;
  profiles: Profile[];
  projects: Project[];
  clients: Client[];
  tasks: Task[];
  logs: TimeLog[];
  attendance: Attendance[];
  toasts: Toast[];
  pushToast: (t: Omit<Toast, "id" | "ttl"> & { ttl?: number }) => void;
  dismissToast: (id: string) => void;
  updateTask: (id: string, patch: Partial<Task>) => Promise<boolean>;
  updateTasks: (ids: string[], patch: Partial<Task>) => Promise<boolean>;
  completeTasks: (ids: string[]) => Promise<void>;
  createTasks: (rows: NewTask[]) => Promise<number>;
  duplicateTasks: (ids: string[]) => Promise<number>;
  deleteTasks: (ids: string[]) => Promise<boolean>;
  createProject: (path: string) => Promise<string | null>;
  createClient: (name: string) => Promise<string | null>;
  startTimer: (taskId: string) => Promise<void>;
  stopTimer: () => Promise<void>;
  punch: (action: PunchAction) => Promise<void>;
}

const Ctx = createContext<Store | null>(null);

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error("useStore outside DataProvider");
  return s;
}

const NINETY_DAYS = 90 * 86400000;
const COPY_FIELDS: (keyof Task)[] = [
  "title", "project_id", "client_id", "job_role", "assignee_id", "tier", "priority", "difficulty",
  "htc", "notes", "repeat", "explanation_url", "start_date", "due_date",
];

function upsert<T extends { id: string }>(list: T[], row: T): T[] {
  const i = list.findIndex((x) => x.id === row.id);
  if (i === -1) return [...list, row];
  const copy = list.slice();
  copy[i] = row;
  return copy;
}

function normalizeTask(t: Task): Task {
  return {
    ...t,
    htc: t.htc === null || t.htc === undefined ? null : Number(t.htc),
    progress: Number(t.progress ?? 0),
    priority: Number(t.priority ?? 3),
    sort_order: Number(t.sort_order ?? 0),
  };
}

export function DataProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [me, setMe] = useState<Profile | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [logs, setLogs] = useState<TimeLog[]>([]);
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const tasksRef = useRef<Task[]>([]);
  tasksRef.current = tasks;
  const logsRef = useRef<TimeLog[]>([]);
  logsRef.current = logs;
  const attRef = useRef<Attendance[]>([]);
  attRef.current = attendance;
  const projRef = useRef<Project[]>([]);
  projRef.current = projects;
  const meRef = useRef<Profile | null>(null);
  meRef.current = me;

  const dismissToast = useCallback((id: string) => setToasts((ts) => ts.filter((t) => t.id !== id)), []);
  const pushToast = useCallback<Store["pushToast"]>(
    (t) => {
      const id = uid();
      const ttl = t.ttl ?? 5000;
      setToasts((ts) => [...ts.slice(-3), { ...t, id, ttl }]);
      setTimeout(() => dismissToast(id), ttl);
    },
    [dismissToast],
  );
  const fail = useCallback((what: string, msg: string) => pushToast({ message: `${what}: ${msg}`, tone: "error" }), [pushToast]);

  // ---------- initial load ----------
  useEffect(() => {
    let cancelled = false;
    if (DEMO_MODE) {
      const asMember = new URLSearchParams(window.location.search).get("demo") === "member";
      setMe(demoProfiles.find((p) => p.is_manager !== asMember) ?? demoProfiles[0]!);
      setProfiles(demoProfiles);
      setProjects(demoProjects);
      setClients(demoClients);
      setTasks(demoTasks);
      setLogs(demoLogs);
      setAttendance(demoAttendance);
      setReady(true);
      return;
    }
    const sb = getBrowserClient();
    (async () => {
      const { data: auth } = await sb.auth.getUser();
      if (!auth.user) {
        setError("Not signed in");
        return;
      }
      // Repeating tasks whose day has come move into today before we read
      await sb.rpc("promote_due_tasks");
      const since = new Date(Date.now() - NINETY_DAYS).toISOString();
      const [pr, pj, cl, tk, lg, at] = await Promise.all([
        sb.from("profiles").select("*").order("name"),
        sb.from("projects").select("*").order("name"),
        sb.from("clients").select("*").order("name"),
        sb.from("tasks").select("*").or(`status.neq.done,completed_at.gte.${since}`),
        sb.from("time_logs").select("*").gte("started_at", since),
        sb.from("attendance").select("*").gte("started_at", new Date(Date.now() - 2 * 86400000).toISOString()),
      ]);
      if (cancelled) return;
      const err = pr.error || pj.error || cl.error || tk.error || lg.error || at.error;
      if (err) {
        setError(err.message);
        return;
      }
      const mine = (pr.data as Profile[]).find((p) => p.auth_id === auth.user!.id) ?? null;
      if (!mine) {
        setError("Your profile was not found. Ask a manager to add you.");
        return;
      }
      setMe(mine);
      setProfiles(pr.data as Profile[]);
      setProjects(pj.data as Project[]);
      setClients(cl.data as Client[]);
      setTasks((tk.data as Task[]).map(normalizeTask));
      setLogs(lg.data as TimeLog[]);
      setAttendance(at.data as Attendance[]);
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // ---------- realtime ----------
  useEffect(() => {
    if (DEMO_MODE || !ready) return;
    const sb = getBrowserClient();
    function apply<T extends { id: string }>(set: (fn: (l: T[]) => T[]) => void, map: (r: T) => T = (r) => r) {
      return (p: RealtimePostgresChangesPayload<T>) => {
        if (p.eventType === "DELETE") {
          const oldId = (p.old as Partial<T>).id;
          set((l) => l.filter((x) => x.id !== oldId));
        } else {
          set((l) => upsert(l, map(p.new as T)));
        }
      };
    }
    const ch = sb
      .channel("uncvrd-tasks-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, apply<Task>(setTasks, normalizeTask))
      .on("postgres_changes", { event: "*", schema: "public", table: "time_logs" }, apply<TimeLog>(setLogs))
      .on("postgres_changes", { event: "*", schema: "public", table: "projects" }, apply<Project>(setProjects))
      .on("postgres_changes", { event: "*", schema: "public", table: "clients" }, apply<Client>(setClients))
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, apply<Profile>(setProfiles))
      .on("postgres_changes", { event: "*", schema: "public", table: "attendance" }, apply<Attendance>(setAttendance))
      .subscribe();
    return () => {
      sb.removeChannel(ch);
    };
  }, [ready]);

  // ---------- tasks ----------
  const updateTasks = useCallback<Store["updateTasks"]>(
    async (ids, patch) => {
      const befores = tasksRef.current.filter((t) => ids.includes(t.id));
      if (!befores.length) return false;
      const stamp = new Date().toISOString();
      setTasks((l) => l.map((t) => (ids.includes(t.id) ? normalizeTask({ ...t, ...patch, updated_at: stamp }) : t)));
      if (DEMO_MODE) return true;
      const { data, error } = await getBrowserClient().from("tasks").update(patch).in("id", ids).select();
      if (error) {
        setTasks((l) => befores.reduce((acc, b) => upsert(acc, b), l));
        fail("Could not save", error.message);
        return false;
      }
      setTasks((l) => (data as Task[]).reduce((acc, r) => upsert(acc, normalizeTask(r)), l));
      return true;
    },
    [fail],
  );

  const updateTask = useCallback<Store["updateTask"]>((id, patch) => updateTasks([id], patch), [updateTasks]);

  const restore = useCallback(
    async (befores: Task[]) => {
      for (const b of befores) {
        await updateTasks([b.id], {
          status: b.status,
          progress: b.progress,
          completed_at: b.completed_at,
          today_at: b.today_at,
        });
      }
      if (DEMO_MODE) {
        // the demo has no database trigger, so remove spawned repeats here
        const ids = befores.map((b) => b.id);
        setTasks((l) => l.filter((t) => !(t.spawned_from && ids.includes(t.spawned_from) && t.progress === 0)));
      }
    },
    [updateTasks],
  );

  const completeTasks = useCallback<Store["completeTasks"]>(
    async (ids) => {
      const befores = tasksRef.current.filter((t) => ids.includes(t.id));
      if (!befores.length) return;
      const next = meRef.current?.is_manager ? "done" : "review";
      const ok = await updateTasks(ids, { status: next, progress: 100, completed_at: new Date().toISOString() });
      if (!ok) return;
      if (DEMO_MODE) {
        const stamp = new Date().toISOString();
        const spawned = befores
          .filter((b) => b.repeat !== "none")
          .map((b) => {
            const nxt = nextOccurrence(b.repeat, b.start_date);
            return normalizeTask({
              ...b,
              id: uid(),
              status: "active",
              progress: 0,
              start_date: nxt,
              due_date: b.due_date ? nxt : null,
              today_at: null,
              completed_at: null,
              spawned_from: b.id,
              created_at: stamp,
              updated_at: stamp,
            });
          });
        if (spawned.length) setTasks((l) => [...l, ...spawned]);
      }
      const label = befores.length === 1 ? `“${befores[0]!.title}”` : `${befores.length} tasks`;
      pushToast({
        message: `${label} moved to ${next === "done" ? "done" : "in review"}`,
        action: { label: "Undo", run: () => restore(befores) },
      });
    },
    [pushToast, restore, updateTasks],
  );

  const createTasks = useCallback<Store["createTasks"]>(
    async (rows) => {
      const m = meRef.current;
      if (!m || rows.length === 0) return 0;
      const base = Date.now() / 1000;
      const prepared = rows.map((r, i) => ({
        ...r,
        assignee_id: m.is_manager ? (r.assignee_id ?? m.id) : m.id,
        created_by: m.id,
        status: r.status ?? "active",
        today_at: r.status === "today" ? new Date().toISOString() : null,
        sort_order: r.sort_order ?? base + i / 1000,
      }));
      if (DEMO_MODE) {
        const stamp = new Date().toISOString();
        const made = prepared.map((r) =>
          normalizeTask({
            id: uid(),
            project_id: null,
            client_id: null,
            job_role: null,
            tier: "need",
            priority: 3,
            difficulty: "SIMP",
            htc: null,
            progress: 0,
            notes: null,
            start_date: null,
            due_date: null,
            repeat: "none",
            explanation_url: null,
            spawned_from: null,
            completed_at: null,
            created_at: stamp,
            updated_at: stamp,
            ...r,
          } as Task),
        );
        setTasks((l) => [...l, ...made]);
        return made.length;
      }
      const { data, error } = await getBrowserClient().from("tasks").insert(prepared).select();
      if (error) {
        fail("Could not create", error.message);
        return 0;
      }
      setTasks((l) => (data as Task[]).reduce((acc, r) => upsert(acc, normalizeTask(r)), l));
      return data.length;
    },
    [fail],
  );

  const duplicateTasks = useCallback<Store["duplicateTasks"]>(
    async (ids) => {
      const src = tasksRef.current.filter((t) => ids.includes(t.id));
      const rows: NewTask[] = src.map((t) => {
        const copy: Record<string, unknown> = {};
        for (const k of COPY_FIELDS) copy[k] = t[k];
        return {
          ...(copy as NewTask),
          title: `${t.title} (copy)`,
          status: t.status === "today" ? "today" : "active",
          sort_order: t.sort_order + 0.0001,
        };
      });
      const n = await createTasks(rows);
      if (n) pushToast({ message: `Duplicated ${n} task${n === 1 ? "" : "s"}` });
      return n;
    },
    [createTasks, pushToast],
  );

  const deleteTasks = useCallback<Store["deleteTasks"]>(
    async (ids) => {
      const befores = tasksRef.current.filter((t) => ids.includes(t.id));
      setTasks((l) => l.filter((t) => !ids.includes(t.id)));
      if (DEMO_MODE) return true;
      const { data, error } = await getBrowserClient().from("tasks").delete().in("id", ids).select("id");
      const deleted = new Set((data ?? []).map((r: { id: string }) => r.id));
      const kept = befores.filter((b) => !deleted.has(b.id));
      if (error || kept.length) {
        setTasks((l) => kept.reduce((acc, b) => upsert(acc, b), l));
        fail("Could not delete", error?.message ?? `${kept.length} task(s) can only be deleted by a manager or the person who created them`);
        return false;
      }
      return true;
    },
    [fail],
  );

  // ---------- projects & clients ----------
  const createProject = useCallback<Store["createProject"]>(
    async (path) => {
      const parts = path.split(/\s*[\\/>]\s*/).map((s) => s.trim()).filter(Boolean);
      if (!parts.length) return null;
      let parentId: string | null = null;
      for (const name of parts) {
        const found: Project | undefined = projRef.current.find((p) => p.name.toLowerCase() === name.toLowerCase() && p.parent_id === parentId);
        if (found) {
          parentId = found.id;
          continue;
        }
        if (DEMO_MODE) {
          const row: Project = { id: uid(), name, parent_id: parentId, archived: false };
          projRef.current = [...projRef.current, row];
          setProjects((l) => [...l, row]);
          parentId = row.id;
          continue;
        }
        const res = await getBrowserClient().from("projects").insert({ name, parent_id: parentId }).select().single();
        if (res.error) {
          fail("Could not create project", res.error.message);
          return null;
        }
        const row = res.data as Project;
        projRef.current = [...projRef.current, row];
        setProjects((l) => upsert(l, row));
        parentId = row.id;
      }
      return parentId;
    },
    [fail],
  );

  const createClient = useCallback<Store["createClient"]>(
    async (name) => {
      const clean = name.trim();
      if (!clean) return null;
      if (DEMO_MODE) {
        const row: Client = { id: uid(), name: clean, archived: false };
        setClients((l) => [...l, row]);
        return row.id;
      }
      const { data, error } = await getBrowserClient().from("clients").insert({ name: clean }).select().single();
      if (error) {
        fail("Could not create client", error.message);
        return null;
      }
      setClients((l) => upsert(l, data as Client));
      return (data as Client).id;
    },
    [fail],
  );

  // ---------- timer ----------
  const stopTimer = useCallback<Store["stopTimer"]>(async () => {
    const m = meRef.current;
    if (!m) return;
    const running = logsRef.current.find((l) => l.user_id === m.id && !l.ended_at);
    if (!running) return;
    const ended_at = new Date().toISOString();
    setLogs((l) => upsert(l, { ...running, ended_at }));
    if (DEMO_MODE) return;
    const { error } = await getBrowserClient().from("time_logs").update({ ended_at }).eq("id", running.id);
    if (error) fail("Timer", error.message);
  }, [fail]);

  const openAttendance = (userId: string) => attRef.current.find((a) => a.user_id === userId && !a.ended_at) ?? null;

  const startAttendance = useCallback(
    async (kind: Attendance["kind"]) => {
      const m = meRef.current;
      if (!m) return;
      const row: Attendance = { id: uid(), user_id: m.id, kind, started_at: new Date().toISOString(), ended_at: null };
      setAttendance((l) => [...l, row]);
      if (DEMO_MODE) return;
      const { data, error } = await getBrowserClient().from("attendance").insert({ user_id: m.id, kind }).select().single();
      setAttendance((l) => l.filter((x) => x.id !== row.id));
      if (error) return fail("Punch", error.message);
      setAttendance((l) => upsert(l, data as Attendance));
    },
    [fail],
  );

  const endAttendance = useCallback(async () => {
    const m = meRef.current;
    if (!m) return;
    const open = openAttendance(m.id);
    if (!open) return;
    const ended_at = new Date().toISOString();
    setAttendance((l) => upsert(l, { ...open, ended_at }));
    if (DEMO_MODE) return;
    const { error } = await getBrowserClient().from("attendance").update({ ended_at }).eq("id", open.id);
    if (error) fail("Punch", error.message);
  }, [fail]);

  const startTimer = useCallback<Store["startTimer"]>(
    async (taskId) => {
      const m = meRef.current;
      if (!m) return;
      await stopTimer();
      // working on a task means you are punched in
      const open = openAttendance(m.id);
      if (!open || open.kind === "break") {
        if (open) await endAttendance();
        await startAttendance("work");
      }
      const row: TimeLog = { id: uid(), task_id: taskId, user_id: m.id, started_at: new Date().toISOString(), ended_at: null };
      setLogs((l) => [...l, row]);
      if (DEMO_MODE) return;
      const { data, error } = await getBrowserClient().from("time_logs").insert({ task_id: taskId, user_id: m.id }).select().single();
      setLogs((l) => l.filter((x) => x.id !== row.id));
      if (error) return fail("Timer", error.message);
      setLogs((l) => upsert(l, data as TimeLog));
    },
    [endAttendance, fail, startAttendance, stopTimer],
  );

  const punch = useCallback<Store["punch"]>(
    async (action) => {
      if (action === "in" || action === "back") {
        await endAttendance();
        await startAttendance("work");
      } else if (action === "break") {
        await stopTimer();
        await endAttendance();
        await startAttendance("break");
      } else {
        await stopTimer();
        await endAttendance();
      }
    },
    [endAttendance, startAttendance, stopTimer],
  );

  const value = useMemo<Store>(
    () => ({
      ready, error, demo: DEMO_MODE, me, profiles, projects, clients, tasks, logs, attendance, toasts,
      pushToast, dismissToast, updateTask, updateTasks, completeTasks, createTasks, duplicateTasks, deleteTasks,
      createProject, createClient, startTimer, stopTimer, punch,
    }),
    [ready, error, me, profiles, projects, clients, tasks, logs, attendance, toasts, pushToast, dismissToast, updateTask,
      updateTasks, completeTasks, createTasks, duplicateTasks, deleteTasks, createProject, createClient, startTimer, stopTimer, punch],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

