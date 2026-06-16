import type { NextRequest } from "next/server";

export default async function middleware(req: NextRequest) {
  throw new Error("MIDDLEWARE_IS_RUNNING");
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};