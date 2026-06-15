import { type NextRequest, NextResponse } from "next/server";
import { DEFAULT_LOCALE, isLocale, type Locale } from "@/lib/i18n";
import { createSupabaseMiddlewareClient } from "@/lib/supabase/middleware";

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
  const authenticated = await hasAuthenticatedSession(supabase);

  const localizedPath = pathname.replace(`/${firstSegment}`, "") || "/";
  if (!authenticated && PROTECTED_PATHS.some((path) => localizedPath === path || localizedPath.startsWith(`${path}/`))) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = `/${firstSegment}/login`;
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  response.cookies.set("kaffelogic-locale", firstSegment, { path: "/", sameSite: "lax" });
  return response;
}

async function hasAuthenticatedSession(supabase: ReturnType<typeof createSupabaseMiddlewareClient>["supabase"]) {
  if (!supabase) return false;
  const { data, error } = await supabase.auth.getClaims();
  return Boolean(!error && data?.claims?.sub);
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
