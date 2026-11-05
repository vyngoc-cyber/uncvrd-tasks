"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useStore } from "@/lib/store";
import { ThemeToggle } from "./ThemeToggle";

export function TopBar() {
  const path = usePathname();
  const { me, demo, attendance, punch } = useStore();
  const links = [
    { href: "/my-day", label: "My Day" },
    ...(me?.is_manager ? [{ href: "/team", label: "Team" }] : []),
    { href: "/projects", label: "Projects" },
    { href: "/tasks", label: "Tasks" },
  ];
  const open = me ? attendance.find((a) => a.user_id === me.id && !a.ended_at) : null;

  return (
    <header className="topbar">
      <Link href="/my-day" className="brand" aria-label="UNCVRD Tasks home">
        <span className="mark" aria-hidden="true" />
        <span className="brand-div" aria-hidden="true" />
        <span className="brand-name">Tasks</span>
      </Link>
      <nav className="nav" aria-label="Main">
        {links.map((l) => (
          <Link key={l.href} href={l.href} className={path.startsWith(l.href) ? "active" : ""}>
            {l.label}
          </Link>
        ))}
      </nav>
      <div className="topbar-right">
        {demo && <span className="demo-badge" title="No Supabase keys set. Changes are not saved.">Demo</span>}
        <div className="punch">
          {!open && <button className="btn btn-sm btn-primary" onClick={() => punch("in")}>Punch in</button>}
          {open?.kind === "work" && (
            <>
              <button className="btn btn-sm" onClick={() => punch("break")}>Break</button>
              <button className="btn btn-sm" onClick={() => punch("out")}>Punch out</button>
            </>
          )}
          {open?.kind === "break" && <button className="btn btn-sm btn-primary" onClick={() => punch("back")}>Back from break</button>}
        </div>
        <ThemeToggle />
        {!demo && (
          <form action="/auth/signout" method="post">
            <button className="btn btn-ghost btn-sm" type="submit">Sign out</button>
          </form>
        )}
      </div>
    </header>
  );
}
