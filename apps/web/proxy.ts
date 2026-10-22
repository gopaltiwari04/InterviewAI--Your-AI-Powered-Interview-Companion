import { getToken } from "next-auth/jwt";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

/**
 * Optimistic route guard: redirects signed-out visitors away from app pages.
 * It is NOT the security boundary; every route handler and server component
 * checks the session and resource ownership on the server again.
 */
const PROTECTED = ["/dashboard", "/interview", "/resume"];

export async function proxy(req: NextRequest) {
  const token = await getToken({
    req,
    secret: process.env.AUTH_SECRET,
    // Secure cookies (the __Secure- prefix) are used on HTTPS only; local http dev uses plain cookies.
    secureCookie: req.nextUrl.protocol === "https:",
  });

  const isLoggedIn = Boolean(token);
  const { pathname } = req.nextUrl;

  if (pathname.startsWith("/login") && isLoggedIn) {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }
  if (PROTECTED.some((p) => pathname === p || pathname.startsWith(`${p}/`)) && !isLoggedIn) {
    const url = new URL("/login", req.url);
    url.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
