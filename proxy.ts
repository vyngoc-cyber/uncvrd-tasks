import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { DEMO_MODE, SUPABASE_ANON_KEY, SUPABASE_URL, isAllowedEmail } from "@/lib/supabase/config";

const PUBLIC_PATHS = ["/login", "/auth/callback", "/auth/signout"];

export async function proxy(request: NextRequest) {
  if (DEMO_MODE) return NextResponse.next();

  let response = NextResponse.next({ request });
  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        list.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const path = request.nextUrl.pathname;
  const isPublic = PUBLIC_PATHS.some((p) => path.startsWith(p));

  if (!isPublic && (!user || !isAllowedEmail(user.email))) {
    const url = request.nextUrl.clone();
    url.pathname = user ? "/auth/signout" : "/login";
    url.search = user ? "?error=domain" : "";
    return NextResponse.redirect(url);
  }
  if (path === "/login" && user && isAllowedEmail(user.email)) {
    const url = request.nextUrl.clone();
    url.pathname = "/my-day";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|icon.png|apple-icon.png|favicon.ico|.*\\.(?:png|svg|jpg|webp|woff2?)$).*)"],
};
