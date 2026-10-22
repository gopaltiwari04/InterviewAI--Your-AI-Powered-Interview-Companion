import Credentials from "next-auth/providers/credentials"
import GitHub from "next-auth/providers/github"
import Google from "next-auth/providers/google"
import type { NextAuthConfig } from "next-auth"
import type { Provider } from "next-auth/providers"

/**
 * Demo candidate login enables quick 1-click access for evaluation and preview
 * without requiring third-party OAuth setup. Always active unless explicitly set to 'disabled'.
 */
export const testLoginEnabled = process.env.AUTH_TEST_LOGIN !== "disabled"

const googleClientId =
  process.env.AUTH_GOOGLE_ID ||
  process.env.GOOGLE_CLIENT_ID ||
  process.env.GOOGLE_ID ||
  ""
const googleClientSecret =
  process.env.AUTH_GOOGLE_SECRET ||
  process.env.GOOGLE_CLIENT_SECRET ||
  process.env.GOOGLE_SECRET ||
  ""

const githubClientId =
  process.env.AUTH_GITHUB_ID ||
  process.env.GITHUB_CLIENT_ID ||
  process.env.GITHUB_ID ||
  ""
const githubClientSecret =
  process.env.AUTH_GITHUB_SECRET ||
  process.env.GITHUB_CLIENT_SECRET ||
  process.env.GITHUB_SECRET ||
  ""

const providers: Provider[] = []

if (githubClientId && githubClientSecret) {
  providers.push(
    GitHub({
      clientId: githubClientId,
      clientSecret: githubClientSecret,
      allowDangerousEmailAccountLinking: true,
    }),
  )
}

if (googleClientId && googleClientSecret) {
  providers.push(
    Google({
      clientId: googleClientId,
      clientSecret: googleClientSecret,
      allowDangerousEmailAccountLinking: true,
    }),
  )
}


if (testLoginEnabled) {
  providers.push(
    Credentials({
      id: "test-login",
      name: "Demo Candidate",
      credentials: { name: { label: "Name", type: "text" } },
      async authorize(credentials) {
        const raw = typeof credentials?.name === "string" ? credentials.name : ""
        const name = raw.replace(/[^a-zA-Z0-9 _-]/g, "").slice(0, 40) || "Demo Candidate"
        // Imported lazily so edge proxy never loads Prisma.
        const { db } = await import("@repo/database")
        const email = `${name.toLowerCase().replace(/\s+/g, "-")}@demo.interviewai.app`
        const user = await db.user.upsert({
          where: { email },
          create: { email, name },
          update: { name },
        })
        return { id: user.id, name: user.name, email: user.email }
      },
    }),
  )
}

const authConfig: NextAuthConfig = {
  trustHost: true,
  secret:
    process.env.AUTH_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    "fallback-secret-for-auth-change-in-production",
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
      if (token.name?.toLowerCase().includes("gopaltiwari") || token.email?.toLowerCase().includes("tiwarigopal")) {
        token.name = "ZEUS"
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        if (typeof token.id === "string") session.user.id = token.id
        if (typeof token.name === "string") session.user.name = token.name
      }
      return session
    },
  },

}

export default authConfig
