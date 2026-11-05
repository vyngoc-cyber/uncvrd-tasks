"use client";
import { useEffect, useState } from "react";

type Mode = "system" | "light" | "dark";
const LABEL: Record<Mode, string> = { system: "Auto", light: "Light", dark: "Dark" };

export function ThemeToggle() {
  const [mode, setMode] = useState<Mode>("system");
  useEffect(() => {
    try {
      const t = localStorage.getItem("uncvrd-theme");
      if (t === "light" || t === "dark") setMode(t);
    } catch {}
  }, []);
  function cycle() {
    const next: Mode = mode === "system" ? "light" : mode === "light" ? "dark" : "system";
    setMode(next);
    try {
      if (next === "system") localStorage.removeItem("uncvrd-theme");
      else localStorage.setItem("uncvrd-theme", next);
    } catch {}
    if (next === "system") delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = next;
  }
  return (
    <button className="btn btn-ghost btn-sm" onClick={cycle} title="Switch theme" aria-label={`Theme: ${LABEL[mode]}`}>
      <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
        <circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <path d="M8 1.5a6.5 6.5 0 0 1 0 13z" fill="currentColor" />
      </svg>
      <span className="theme-label">{LABEL[mode]}</span>
    </button>
  );
}
