export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
export const ALLOWED_DOMAIN = (process.env.NEXT_PUBLIC_ALLOWED_DOMAIN ?? "uncvrd.com").toLowerCase();
/** No Supabase keys = demo mode with sample data and no login. */
export const DEMO_MODE = !SUPABASE_URL || !SUPABASE_ANON_KEY;

export function isAllowedEmail(email: string | null | undefined): boolean {
  return !!email && email.toLowerCase().endsWith("@" + ALLOWED_DOMAIN);
}
