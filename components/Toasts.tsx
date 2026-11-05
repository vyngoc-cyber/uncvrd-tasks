"use client";
import { useStore } from "@/lib/store";

export function Toasts() {
  const { toasts, dismissToast } = useStore();
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.tone === "error" ? "error" : ""}`}>
          <span>{t.message}</span>
          {t.action && (
            <button
              onClick={() => {
                t.action!.run();
                dismissToast(t.id);
              }}
            >
              {t.action.label}
            </button>
          )}
          <span className="ttl" style={{ animationDuration: `${t.ttl}ms` }} />
        </div>
      ))}
    </div>
  );
}
