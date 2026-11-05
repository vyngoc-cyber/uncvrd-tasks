"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import type { NewTask, Profile, Project, Task, TimeLog } from "./types";
import { DEMO_MODE } from "./supabase/config";
import { getBrowserClient } from "./supabase/client";
import { demoLogs, demoProfiles, demoProjects, demoTasks } from "./demo";
import { uid } from "./util";

export interface Toast {
  id: string;
  message: string;
  action?: { label: string; run: () => void };
  ttl: number;
  tone?: "error";
}

interface Store {
  ready: boolean;
  error: string | null;
  demo: boolean;
  me: Profile | null;
  profiles: Profile[];
  projects: Project[];
  tasks: Task[];
  logs: TimeLog[];
  toasts: Toast[];
  pushToast: (t: Omit<Toast, "id" | "ttl"> & { ttl?: number }) => void;
  dismissToast: (id: string) => void;
  updateTask: (id: string, patch: Partial<Task>) => Promise<boolean>;
  completeTask: (id: string) => Promise<void>;
  createTasks: (rows: NewTask[]) => Promise<number>;
  startTimer: (taskId: string) => Promise<void>;
  stopTimer: () => Promise<void>;
}

const Ctx = createContext<Store | null>(null);

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error("useStore outside DataProvider");
  return s;
}

const NINETY_DAYS = 90 * 86400000;

function upsert<T extends { id: string }>(list: T[], row: T): T[] {
  const i = list.findIndex((x) => x.id === row.id);
  if (i === -1) return [...list, row];
  const copy = list.slice();
  copy[i] = row;
  return copy;
}

export function DataProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [me, setMe] = useState<Profile | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [logs, setLogs] = useState<TimeLog[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const tasksRef = useRef<Task[]>([]);
  tasksRef.current = tasks;
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

  // ---------- initial load ----------
  useEffect(() => {
    let cancelled = false;
    if (DEMO_MODE) {
      const asManager = new URLSearchParams(window.location.search).get("demo") === "manager";
      setMe(demoProfiles.find((p) => p.is_manager === asManager) ?? demoProfiles[0]!);
      setProfiles(demoProfiles);
      setProjects(demoProjects);
      setTasks(demoTasks);
      setLogs(demoLogs);
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
      const since = new Date(Date.now() - NINETY_DAYS).toISOString();
      const [pr, pj, tk, lg] = await Promise.all([
        sb.from("profiles").select("*").order("name"),
        sb.from("projects").select("*").order("name"),
        sb.from("tasks").select("*").or(`status.neq.done,completed_at.gte.${since}`),
        sb.from("time_logs").select("*").gte("started_at", since),
      ]);
      if (cancelled) return;
      const err = pr.error || pj.error || tk.error || lg.error;
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
      setTasks((tk.data as Task[]).map(normalizeTask));
      setLogs(lg.data as TimeLog[]);
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
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, apply<Profile>(setProfiles))
      .subscribe();
    return () => {
      sb.removeChannel(ch);
    };
  }, [ready]);

  // ---------- actions ----------
  const updateTask = useCallback<Store["updateTask"]>(
    async (id, patch) => {
      const before = tasksRef.current.find((t) => t.id === id);
      if (!before) return false;
      const optimistic = normalizeTask({ ...before, ...patch, updated_at: new Date().toISOString() });
      setTasks((l) => upsert(l, optimistic));
      if (DEMO_MODE) return true;
      const { data, error } = await getBrowserClient().from("tasks").update(patch).eq("id", id).select().single();
      if (error) {
        setTasks((l) => upsert(l, before));
        pushToast({ message: `Could not save: ${error.message}`, tone: "error" });
        return false;
      }
      setTasks((l) => upsert(l, normalizeTask(data as Task)));
      return true;
    },
    [pushToast],
  );

  const completeTask = useCallback<Store["completeTask"]>(
    async (id) => {
      const before = tasksRef.current.find((t) => t.id === id);
      const mgr = meRef.current?.is_manager;
      if (!before) return;
      const next = mgr ? "done" : "review";
      const ok = await updateTask(id, { status: next, progress: 100, completed_at: new Date().toISOString() });
      if (!ok) return;
      pushToast({
        message: `“${before.title}” moved to ${next === "done" ? "done" : "in review"}`,
        action: {
          label: "Undo",
          run: () =>
            updateTask(id, {
              status: before.status,
              progress: before.progress,
              completed_at: before.completed_at,
              today_at: before.today_at,
            }),
        },
      });
    },
    [pushToast, updateTask],
  );

  const createTasks = useCallback<Store["createTasks"]>(
    async (rows) => {
      const m = meRef.current;
      if (!m || rows.length === 0) return 0;
      const prepared = rows.map((r) => ({
        ...r,
        assignee_id: m.is_manager ? (r.assignee_id ?? m.id) : m.id,
        created_by: m.id,
        status: r.status ?? "active",
        today_at: r.status === "today" ? new Date().toISOString() : null,
      }));
      if (DEMO_MODE) {
        const stamp = new Date().toISOString();
        const made = prepared.map((r) =>
          normalizeTask({
            id: uid(),
            project_id: null,
            job_role: null,
            priority: "need",
            difficulty: "SIMP",
            htc: null,
            progress: 0,
            notes: null,
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
        pushToast({ message: `Could not create: ${error.message}`, tone: "error" });
        return 0;
      }
      setTasks((l) => (data as Task[]).reduce((acc, r) => upsert(acc, normalizeTask(r)), l));
      return data.length;
    },
    [pushToast],
  );

  const stopTimer = useCallback<Store["stopTimer"]>(async () => {
    const m = meRef.current;
    if (!m) return;
    const running = logsRef.current.find((l) => l.user_id === m.id && !l.ended_at);
    if (!running) return;
    const ended_at = new Date().toISOString();
    setLogs((l) => upsert(l, { ...running, ended_at }));
    if (DEMO_MODE) return;
    const { error } = await getBrowserClient().from("time_logs").update({ ended_at }).eq("id", running.id);
    if (error) pushToast({ message: `Timer: ${error.message}`, tone: "error" });
  }, [pushToast]);

  const logsRef = useRef<TimeLog[]>([]);
  logsRef.current = logs;

  const startTimer = useCallback<Store["startTimer"]>(
    async (taskId) => {
      const m = meRef.current;
      if (!m) return;
      await stopTimer();
      const row: TimeLog = { id: uid(), task_id: taskId, user_id: m.id, started_at: new Date().toISOString(), ended_at: null };
      setLogs((l) => [...l, row]);
      if (DEMO_MODE) return;
      const { data, error } = await getBrowserClient()
        .from("time_logs")
        .insert({ task_id: taskId, user_id: m.id })
        .select()
        .single();
      setLogs((l) => l.filter((x) => x.id !== row.id));
      if (error) {
        pushToast({ message: `Timer: ${error.message}`, tone: "error" });
        return;
      }
      setLogs((l) => upsert(l, data as TimeLog));
    },
    [pushToast, stopTimer],
  );

  const value = useMemo<Store>(
    () => ({
      ready,
      error,
      demo: DEMO_MODE,
      me,
      profiles,
      projects,
      tasks,
      logs,
      toasts,
      pushToast,
      dismissToast,
      updateTask,
      completeTask,
      createTasks,
      startTimer,
      stopTimer,
    }),
    [ready, error, me, profiles, projects, tasks, logs, toasts, pushToast, dismissToast, updateTask, completeTask, createTasks, startTimer, stopTimer],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

function normalizeTask(t: Task): Task {
  return { ...t, htc: t.htc === null || t.htc === undefined ? null : Number(t.htc), progress: Number(t.progress ?? 0) };
}
