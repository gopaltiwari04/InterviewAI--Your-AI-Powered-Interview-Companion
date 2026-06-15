import NextAuth, { type NextAuthConfig } from "next-auth"
import { PrismaAdapter } from "@auth/prisma-adapter"
import { db } from "@repo/database"
import authConfig from "./auth.config"

type NextAuthInstance = ReturnType<typeof NextAuth>

const nextAuth = NextAuth({
  adapter: PrismaAdapter(db),
  ...authConfig,
} as NextAuthConfig)

export const handlers = nextAuth.handlers
export const auth: NextAuthInstance["auth"] = nextAuth.auth
export const signOut = nextAuth.signOut
export const signIn: typeof nextAuth.signIn = nextAuth.signIn