import { NextRequest, NextResponse } from "next/server";
import { validSessionToken } from "./lib/auth";

const COOKIE_NAME = "preorder_dashboard_auth";

export async function middleware(request: NextRequest) {
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

  // Customer details and fulfillment actions require configured authentication.
  if (!expected) {
    return new NextResponse("Authentication is not configured", { status: 503 });
  }

  if (expected && await validSessionToken(cookie, expected)) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ ok: false, error: "Session expired. Sign in again." }, { status: 401 });
  }

  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = "/login";
  loginUrl.searchParams.set("next", pathname + (searchParams.toString() ? `?${searchParams.toString()}` : ""));
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
