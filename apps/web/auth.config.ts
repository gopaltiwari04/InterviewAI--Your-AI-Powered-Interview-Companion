import Credentials from "next-auth/providers/credentials"
import GitHub from "next-auth/providers/github"
import Google from "next-auth/providers/google"
import type { NextAuthConfig } from "next-auth"
import type { Provider } from "next-auth/providers"

/**
 * Test-only sign-in used by the Playwright suite. It is registered only when
 * AUTH_TEST_LOGIN=enabled AND the server is not a production build, so it can
 * never be switched on in a deployed app.
 */
export const testLoginEnabled = process.env.AUTH_TEST_LOGIN === "enabled" && process.env.NODE_ENV !== "production"

const providers: Provider[] = [
  GitHub({
    clientId: process.env.AUTH_GITHUB_ID,
    clientSecret: process.env.AUTH_GITHUB_SECRET,
  }),
  Google({
    clientId: process.env.AUTH_GOOGLE_ID,
    clientSecret: process.env.AUTH_GOOGLE_SECRET,
  }),
]

if (testLoginEnabled) {
  providers.push(
    Credentials({
      id: "test-login",
      name: "Test login",
      credentials: { name: { label: "Name", type: "text" } },
      async authorize(credentials) {
        const raw = typeof credentials?.name === "string" ? credentials.name : ""
        const name = raw.replace(/[^a-zA-Z0-9 _-]/g, "").slice(0, 40) || "Test User"
        // Imported lazily so the edge proxy never loads Prisma.
        const { db } = await import("@repo/database")
        const email = `${name.toLowerCase().replace(/\s+/g, "-")}@e2e.test`
        const user = await db.user.upsert({ where: { email }, create: { email, name }, update: {} })
        return { id: user.id, name: user.name, email: user.email }
      },
    }),
  )
}

const authConfig: NextAuthConfig = {
  trustHost: true,
  secret: process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || "fallback-secret-for-auth-change-in-production",
  providers,
  session: {
    strategy: "jwt",
  },
  pages: {
    signIn: "/login",
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user?.id) token.id = user.id
      return token
    },
    async session({ session, token }) {
      if (session.user && typeof token.id === "string") session.user.id = token.id
      return session
    },
  },
}

export default authConfig
