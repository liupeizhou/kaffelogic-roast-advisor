import { type NextRequest, NextResponse } from "next/server";
import { DEFAULT_LOCALE, isLocale, type Locale } from "@/lib/i18n";
import { createSupabaseMiddlewareClient } from "@/lib/supabase/middleware";
import { isAdminEmail } from "@/lib/user-groups";

const PROTECTED_PATHS = ["/upload", "/editor", "/account", "/admin"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const firstSegment = pathname.split("/").filter(Boolean)[0];

  if (!firstSegment || !isLocale(firstSegment)) {
    if (pathname === "/") {
      const url = request.nextUrl.clone();
      url.pathname = `/${resolvePreferredLocale(request)}`;
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  const { supabase, response } = createSupabaseMiddlewareClient(request);
  const session = await getAuthenticatedSession(supabase);
  const authenticated = session.authenticated;

  const localizedPath = pathname.replace(`/${firstSegment}`, "") || "/";
  if (!authenticated && PROTECTED_PATHS.some((path) => localizedPath === path || localizedPath.startsWith(`${path}/`))) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = `/${firstSegment}/login`;
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (authenticated && isAdminPath(localizedPath) && !isAdminEmail(session.email)) {
    const deniedUrl = request.nextUrl.clone();
    deniedUrl.pathname = `/${firstSegment}/account`;
    deniedUrl.searchParams.set("admin", "forbidden");
    return NextResponse.redirect(deniedUrl);
  }

  response.cookies.set("kaffelogic-locale", firstSegment, { path: "/", sameSite: "lax" });
  return response;
}

async function getAuthenticatedSession(supabase: ReturnType<typeof createSupabaseMiddlewareClient>["supabase"]) {
  if (!supabase) return { authenticated: false, email: "" };
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims as { sub?: string; email?: string } | undefined;
  return {
    authenticated: Boolean(!error && claims?.sub),
    email: claims?.email ?? ""
  };
}

function isAdminPath(pathname: string) {
  return pathname === "/admin" || pathname.startsWith("/admin/");
}

function resolvePreferredLocale(request: NextRequest): Locale {
  const cookieLocale = request.cookies.get("kaffelogic-locale")?.value;
  if (isLocale(cookieLocale)) return cookieLocale;
  const header = request.headers.get("accept-language")?.toLowerCase() ?? "";
  if (header.includes("en")) return "en";
  return DEFAULT_LOCALE;
}

export const config = {
  matcher: [
    "/",
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"
  ]
};
