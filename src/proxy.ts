import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";

/** /api/v1 and /api/v2 authenticate with API keys or are the sign-in endpoints themselves, not the session cookie. */
const PUBLIC = [/^\/login/, /^\/verify(\/|$)/, /^\/api\/verify/, /^\/api\/v[12](\/|$)/, /^\/(manifest\.webmanifest|sw\.js|offline\.html)$/];
const key = new TextEncoder().encode(process.env.SESSION_SECRET);

export async function proxy(request: NextRequest) {
  if (PUBLIC.some((r) => r.test(request.nextUrl.pathname))) return NextResponse.next();

  const token = request.cookies.get("nluja_session")?.value;
  if (token) {
    try {
      await jwtVerify(token, key, { algorithms: ["HS256"] });
      return NextResponse.next();
    } catch {}
  }
  return NextResponse.redirect(new URL("/login", request.url));
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|brand/|demo-assets/|.*\\.(?:png|jpg|jpeg|webp|svg|pdf)$).*)"],
};
