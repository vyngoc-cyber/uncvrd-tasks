"use client";

import { useEffect, useState, type ReactNode } from "react";
import type { Difficulty } from "@/lib/types";
import { DIFFICULTIES, PRIORITY_BANDS } from "@/lib/util";

export function Modal({ title, sub, onClose, children, wide }: { title: string; sub?: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="overlay" onMouseDown={onClose}>
      <div className={`modal ${wide ? "wide" : ""}`} role="dialog" aria-modal="true" aria-label={title} onMouseDown={(e) => e.stopPropagation()}>
        <div>
          <h3 className="modal-title">{title}</h3>
          {sub && <p className="modal-sub">{sub}</p>}
        </div>
        {children}
      </div>
    </div>
  );
}

export function PriorityDialog({ initial, onSave, onClose }: { initial: number; onSave: (v: number) => void; onClose: () => void }) {
  const [v, setV] = useState(initial.toFixed(1));
  const n = Number(v.replace(",", "."));
  const valid = !isNaN(n) && n >= 1 && n <= 4.9;
  return (
    <Modal title="Update priority" sub="Pick the priority band for this task. Lower is more urgent." onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) onSave(Math.round(n * 10) / 10);
        }}
        className="stack"
      >
        <div className="field">
          <label htmlFor="prio-input">Priority (1.0 - 4.9)</label>
          <input id="prio-input" className="input" inputMode="decimal" value={v} autoFocus onFocus={(e) => e.target.select()} onChange={(e) => setV(e.target.value)} />
          <p className="hint-text">
            {PRIORITY_BANDS.map((b) => `${b.value}.0 = ${b.label.toUpperCase()}`).join("  |  ")}
          </p>
        </div>
        <div className="chips">
          {[1, 1.5, 2, 2.5, 3, 3.5, 4].map((x) => (
            <button type="button" key={x} className={`chip ${n === x ? "on" : ""}`} onClick={() => setV(x.toFixed(1))}>
              {x.toFixed(1)}
            </button>
          ))}
        </div>
        <div className="modal-foot">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={!valid}>Update</button>
        </div>
      </form>
    </Modal>
  );
}

export function DifficultyDialog({ initial, onSave, onClose }: { initial: Difficulty | null; onSave: (v: Difficulty) => void; onClose: () => void }) {
  return (
    <Modal title="Update difficulty" sub="Select the difficulty level for this task." onClose={onClose}>
      <div className="stack">
        {DIFFICULTIES.map((d) => (
          <button key={d.value} className={`diff-option ${initial === d.value ? "on" : ""}`} onClick={() => onSave(d.value)}>
            <span className="pill">{d.value}</span>
            <span>{d.text}</span>
          </button>
        ))}
      </div>
    </Modal>
  );
}

export function ProgressDialog({ initial, onSave, onClose }: { initial: number; onSave: (v: number) => void; onClose: () => void }) {
  const [v, setV] = useState(initial);
  return (
    <Modal title="Update status %" sub="Setting 100% sends the task to review." onClose={onClose}>
      <div className="stack">
        <div className="progress big">
          <input type="range" min={0} max={100} step={5} value={v} onChange={(e) => setV(Number(e.target.value))} aria-label="Status percent" />
          <span>{v}%</span>
        </div>
        <div className="modal-foot">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={() => onSave(v)}>Update</button>
        </div>
      </div>
    </Modal>
  );
}

export function ChoiceDialog({ title, options, onSave, onClose, allowNew }: {
  title: string;
  options: { id: string; label: string }[];
  onSave: (id: string | null) => void;
  onClose: () => void;
  allowNew?: (name: string) => Promise<string | null>;
}) {
  const [q, setQ] = useState("");
  const list = options.filter((o) => o.label.toLowerCase().includes(q.toLowerCase()));
  return (
    <Modal title={title} onClose={onClose}>
      <div className="stack">
        <input className="input" placeholder="Search…" value={q} autoFocus onChange={(e) => setQ(e.target.value)} />
        <div className="choice-list">
          <button className="choice" onClick={() => onSave(null)}>None</button>
          {list.map((o) => (
            <button key={o.id} className="choice" onClick={() => onSave(o.id)}>{o.label}</button>
          ))}
          {allowNew && q.trim() && !list.some((o) => o.label.toLowerCase() === q.trim().toLowerCase()) && (
            <button
              className="choice new"
              onClick={async () => {
                const id = await allowNew(q.trim());
                if (id) onSave(id);
              }}
            >
              + Create “{q.trim()}”
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}
