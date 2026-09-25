import { NextResponse } from "next/server";
import { createSessionToken } from "../../../../lib/auth";

const COOKIE_NAME = "preorder_dashboard_auth";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const password = body?.password;
    const expected = process.env.PREORDER_APP_PASSWORD;

    if (!expected) {
      return NextResponse.json(
        { ok: false, error: "PREORDER_APP_PASSWORD is not set" },
        { status: 500 }
      );
    }

    if (!password || password !== expected) {
      return NextResponse.json(
        { ok: false, error: "Invalid password" },
        { status: 401 }
      );
    }

    const response = NextResponse.json({ ok: true });

    response.cookies.set({
      name: COOKIE_NAME,
      value: await createSessionToken(expected),
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });

    return response;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid request" },
      { status: 400 }
    );
  }
}
