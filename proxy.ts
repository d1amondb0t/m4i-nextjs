import { NextResponse, type NextRequest } from "next/server";

import { SESSION_COOKIE } from "./app/server/auth/session-helper";

// A quick redirect for signed-out visitors. Pages and API routes still
// verify the signed session themselves.
export function proxy(request: NextRequest) {
  if (request.cookies.has(SESSION_COOKIE)) return NextResponse.next();

  const login = new URL("/login", request.url);
  login.searchParams.set("next", request.nextUrl.pathname);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ["/((?!api|login|_next/static|_next/image|favicon.ico).*)"],
};
