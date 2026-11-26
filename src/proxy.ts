import { NextResponse, type NextRequest } from "next/server";

/**
 * Optimistic check only: bounce visitors with no session cookie before rendering.
 * It does NOT validate the session; pages and Server Actions do that through the
 * Data Access Layer (src/lib/auth/dal.ts), which is the real security boundary.
 */
export function proxy(request: NextRequest) {
  if (!request.cookies.has("eduwave_session")) {
    const url = new URL("/login", request.url);
    // Return here after signing in (validated server-side against the user's role).
    if (request.nextUrl.pathname !== "/") url.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/instructor/:path*", "/student/:path*", "/files/:path*"],
};
