import { type NextRequest, NextResponse } from "next/server";
import { DEFAULT_LOCALE, isLocale, type Locale } from "@/lib/i18n";
import { createSupabaseMiddlewareClient } from "@/lib/supabase/middleware";
import { isAdminEmail } from "@/lib/user-groups";

const PROTECTED_PATHS = ["/upload", "/editor", "/account", "/admin"];
const SECURITY_HEADERS: Array<[string, string]> = [
  ["X-Frame-Options", "DENY"],
  ["X-Content-Type-Options", "nosniff"],
  ["Referrer-Policy", "strict-origin-when-cross-origin"],
  ["Permissions-Policy", "camera=(), microphone=(), geolocation=()"]
];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const firstSegment = pathname.split("/").filter(Boolean)[0];

  if (!firstSegment || !isLocale(firstSegment)) {
    if (pathname === "/") {
      const url = request.nextUrl.clone();
      url.pathname = `/${resolvePreferredLocale(request)}`;
      return withSecurityHeaders(NextResponse.redirect(url));
    }
    return withSecurityHeaders(NextResponse.next());
  }

  const { supabase, response } = createSupabaseMiddlewareClient(request);
  const session = await getAuthenticatedSession(supabase);
  const authenticated = session.authenticated;

  const localizedPath = pathname.replace(`/${firstSegment}`, "") || "/";
  if (!authenticated && PROTECTED_PATHS.some((path) => localizedPath === path || localizedPath.startsWith(`${path}/`))) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = `/${firstSegment}/login`;
    loginUrl.searchParams.set("next", pathname);
    return withSecurityHeaders(NextResponse.redirect(loginUrl));
  }

  if (authenticated && isAdminPath(localizedPath) && !isAdminEmail(session.email)) {
    const deniedUrl = request.nextUrl.clone();
    deniedUrl.pathname = `/${firstSegment}/account`;
    deniedUrl.searchParams.set("admin", "forbidden");
    return withSecurityHeaders(NextResponse.redirect(deniedUrl));
  }

  response.cookies.set("kaffelogic-locale", firstSegment, { path: "/", sameSite: "lax" });
  return withSecurityHeaders(response);
}

function withSecurityHeaders(response: NextResponse) {
  for (const [key, value] of SECURITY_HEADERS) response.headers.set(key, value);
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
  runtime: "nodejs",
  matcher: [
    "/",
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"
  ]
};
