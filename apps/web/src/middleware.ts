import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const RESTRICTED_PREFIXES = ["/app", "/portal", "/approval", "/plan", "/replay"];
const TAILSCALE_LOGIN_HEADER = "tailscale-user-login";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname === "/" && request.headers.get(TAILSCALE_LOGIN_HEADER)) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/portal";
    redirectUrl.search = "";
    return NextResponse.redirect(redirectUrl);
  }

  if (process.env.ELEMATE_PUBLIC_SITE_MODE !== "landing-only") {
    return NextResponse.next();
  }

  if (!RESTRICTED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) {
    return NextResponse.next();
  }

  const redirectUrl = request.nextUrl.clone();
  redirectUrl.pathname = pathname === "/app" ? "/download" : "/";
  redirectUrl.search = "";
  return NextResponse.redirect(redirectUrl);
}

export const config = {
  matcher: ["/", "/app/:path*", "/portal/:path*", "/approval/:path*", "/plan/:path*", "/replay/:path*"],
};
