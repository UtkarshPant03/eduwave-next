import { NextResponse, type NextRequest } from "next/server";

/**
 * Optimistic check only: bounce visitors with no session cookie before rendering.
 * It does NOT validate the session; pages and Server Actions do that through the
 * Data Access Layer (src/lib/auth/dal.ts), which is the real security boundary.
 */
export function proxy(request: NextRequest) {
  if (!request.cookies.has("eduwave_session")) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/teacher/:path*", "/student/:path*"],
};
