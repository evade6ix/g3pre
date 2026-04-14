import { NextRequest, NextResponse } from "next/server";

const COOKIE_NAME = "preorder_dashboard_auth";

export function middleware(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;

  // Allow static files and Next internals
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon.ico") ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/login")
  ) {
    return NextResponse.next();
  }

  const cookie = request.cookies.get(COOKIE_NAME)?.value;
  const expected = process.env.PREORDER_APP_PASSWORD;

  // If no password is set, don't block the site
  if (!expected) {
    return NextResponse.next();
  }

  if (cookie === "ok") {
    return NextResponse.next();
  }

  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = "/login";
  loginUrl.searchParams.set("next", pathname + (searchParams.toString() ? `?${searchParams.toString()}` : ""));
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};