"use client";
import { useEffect, useState } from "react";
import { getBrowserClient } from "@/lib/supabase/client";
import { ALLOWED_DOMAIN, DEMO_MODE } from "@/lib/supabase/config";

const ERRORS: Record<string, string> = {
  domain: `Only @${ALLOWED_DOMAIN} Google accounts can sign in.`,
  exchange: "Sign-in could not be completed. Try again.",
  missing_code: "Sign-in was cancelled.",
};

export default function LoginPage() {
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const e = new URLSearchParams(window.location.search).get("error");
    if (e) setErr(ERRORS[e] ?? "Sign-in failed.");
  }, []);

  async function signIn() {
    if (DEMO_MODE) {
      window.location.href = "/my-day";
      return;
    }
    setBusy(true);
    const { error } = await getBrowserClient().auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        queryParams: { hd: ALLOWED_DOMAIN, prompt: "select_account" },
      },
    });
    if (error) {
      setErr(error.message);
      setBusy(false);
    }
  }

  return (
    <main className="login">
      <div className="login-box">
        <div className="wordmark">UNCVRD<sup>®</sup></div>
        <h2 style={{ fontSize: 26 }}>Tasks</h2>
        <p>Sign in with your @{ALLOWED_DOMAIN} Google account.</p>
        <button className="btn btn-primary" style={{ padding: "12px 18px", fontSize: 14 }} onClick={signIn} disabled={busy}>
          {busy ? "Redirecting…" : "Sign in with Google"}
        </button>
        {err && <p className="error-text">{err}</p>}
      </div>
    </main>
  );
}
