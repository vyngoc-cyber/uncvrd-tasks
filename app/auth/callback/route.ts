import { NextResponse, type NextRequest } from "next/server";
import { getServerClient } from "@/lib/supabase/server";
import { isAllowedEmail } from "@/lib/supabase/config";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  // Supabase sends error_description when the sign-up trigger rejects a non-UNCVRD email
  if (searchParams.get("error")) {
    return NextResponse.redirect(`${origin}/login?error=domain`);
  }
  if (!code) return NextResponse.redirect(`${origin}/login?error=missing_code`);

  const supabase = await getServerClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return NextResponse.redirect(`${origin}/login?error=exchange`);

  if (!isAllowedEmail(data.user?.email)) {
    await supabase.auth.signOut();
    return NextResponse.redirect(`${origin}/login?error=domain`);
  }
  return NextResponse.redirect(`${origin}/my-day`);
}
