import { getToken } from "next-auth/jwt"
import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"

export default async function middleware(req: NextRequest) {
  const token = await getToken({
  req,
  secret: process.env.AUTH_SECRET,
})
  const isLoggedIn = !!token
  const { pathname } = req.nextUrl

  const isAuthRoute = pathname.startsWith("/login")
  const isProtectedRoute =
    pathname.startsWith("/dashboard") //||
    //pathname.startsWith("/interview")                 {REMOVE THIS}

  if (isAuthRoute && isLoggedIn) {
    return NextResponse.redirect(new URL("/dashboard", req.nextUrl))
  }

  if (isProtectedRoute && !isLoggedIn) {
    return NextResponse.redirect(new URL("/login", req.nextUrl))
  }
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
}