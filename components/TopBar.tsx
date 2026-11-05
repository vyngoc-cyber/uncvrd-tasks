"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useStore } from "@/lib/store";
import { ThemeToggle } from "./ThemeToggle";

export function TopBar() {
  const path = usePathname();
  const { me, demo } = useStore();
  const links = [
    { href: "/my-day", label: "My Day" },
    ...(me?.is_manager ? [{ href: "/team", label: "Team" }] : []),
    { href: "/projects", label: "Projects" },
    { href: "/tasks", label: "Tasks" },
  ];
  return (
    <header className="topbar">
      <Link href="/my-day" className="wordmark" aria-label="UNCVRD Tasks home">
        UNCVRD<sup>®</sup>
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
