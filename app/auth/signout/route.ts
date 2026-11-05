import { NextResponse, type NextRequest } from "next/server";
import { getServerClient } from "@/lib/supabase/server";
import { DEMO_MODE } from "@/lib/supabase/config";

async function handle(request: NextRequest) {
  const { origin, searchParams } = new URL(request.url);
  if (!DEMO_MODE) {
    const supabase = await getServerClient();
    await supabase.auth.signOut();
  }
  const err = searchParams.get("error");
  return NextResponse.redirect(`${origin}/login${err ? `?error=${encodeURIComponent(err)}` : ""}`, { status: 303 });
}

export const GET = handle;
export const POST = handle;
