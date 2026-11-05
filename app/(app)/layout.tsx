"use client";
import { DataProvider, useStore } from "@/lib/store";
import { TopBar } from "@/components/TopBar";
import { Toasts } from "@/components/Toasts";

function Gate({ children }: { children: React.ReactNode }) {
  const { ready, error } = useStore();
  if (error)
    return (
      <div className="page">
        <h1>Something went wrong</h1>
        <p className="error-text">{error}</p>
        <a className="btn" href="/auth/signout">Sign out</a>
      </div>
    );
  if (!ready) return <div className="hint" style={{ padding: 48 }}>Loading…</div>;
  return <>{children}</>;
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <DataProvider>
      <TopBar />
      <Gate>{children}</Gate>
      <Toasts />
    </DataProvider>
  );
}
