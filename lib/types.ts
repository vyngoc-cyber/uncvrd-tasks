export type TaskStatus = "active" | "today" | "review" | "done";
export type Priority = "need" | "nice";
export type Difficulty = "SIMP" | "MOD";

export interface Profile {
  id: string;
  auth_id: string | null;
  email: string;
  name: string;
  job_role: string | null;
  is_manager: boolean;
}

export interface Project {
  id: string;
  name: string;
  parent_id: string | null;
  archived: boolean;
}

export interface Task {
  id: string;
  title: string;
  project_id: string | null;
  job_role: string | null;
  assignee_id: string | null;
  created_by: string | null;
  priority: Priority;
  difficulty: Difficulty;
  htc: number | null;
  progress: number;
  status: TaskStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
  today_at: string | null;
  completed_at: string | null;
}

export interface TimeLog {
  id: string;
  task_id: string;
  user_id: string;
  started_at: string;
  ended_at: string | null;
}

export type NewTask = Partial<Omit<Task, "id" | "created_at" | "updated_at">> & { title: string };
