import type { Metadata } from "next";
import { signIn } from "@/auth";
import { testLoginEnabled } from "@/auth.config";
import {
  AcademicCodeBackground,
  MotivationalQuotes,
  TypewriterHeader,
} from "@/components/login/login-interactive";
import { Sparkles } from "lucide-react";

export const metadata: Metadata = { title: "Sign in" };

/** Only same-site relative paths are allowed as post-login destinations (no open redirects). */
function safeCallback(value: string | string[] | undefined): string {
  const v = Array.isArray(value) ? value[0] : value;
  return v && v.startsWith("/") && !v.startsWith("//") ? v : "/dashboard";
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const redirectTo = safeCallback((await searchParams).callbackUrl);

  return (
    <main
      id="main"
      className="relative min-h-screen flex flex-col justify-between py-8 sm:py-12 sm:px-6 lg:px-8 overflow-hidden bg-slate-50"
    >
      {/* Background Animated Blobs, Grid & Particles */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        {/* Animated Gradient Mesh Blobs */}
        <div className="login-blob-1 absolute -top-28 -left-28 size-[26rem] rounded-full bg-gradient-to-tr from-indigo-500/25 via-purple-400/20 to-pink-400/20 blur-3xl" />
        <div className="login-blob-2 absolute top-1/4 -right-20 size-[30rem] rounded-full bg-gradient-to-br from-blue-400/20 via-cyan-300/20 to-indigo-400/20 blur-3xl" />
        <div className="login-blob-3 absolute -bottom-28 left-1/4 size-[28rem] rounded-full bg-gradient-to-tl from-purple-400/20 via-indigo-300/20 to-teal-300/20 blur-3xl" />

        {/* Subtle Tech Grid */}
        <div className="login-grid-pulse absolute inset-0 bg-[radial-gradient(#4f46e5_1px,transparent_1px)] [background-size:24px_24px] opacity-25" />

        {/* Floating Tech Badges / Particles */}
        <div className="login-particle particle-1 absolute top-[18%] left-[9%] hidden md:block rounded-full border border-indigo-200/60 bg-white/60 px-3 py-1 font-mono text-xs text-indigo-600/80 shadow-sm backdrop-blur-sm select-none">
          &lt;Interview /&gt;
        </div>
        <div className="login-particle particle-2 absolute top-[72%] left-[8%] hidden md:block rounded-full border border-purple-200/60 bg-white/60 px-3 py-1 font-mono text-xs text-purple-600/80 shadow-sm backdrop-blur-sm select-none">
          &#123; algorithm: &quot;optimal&quot; &#125;
        </div>
        <div className="login-particle particle-3 absolute top-[25%] right-[11%] hidden md:block rounded-full border border-blue-200/60 bg-white/60 px-3 py-1 font-mono text-xs text-blue-600/80 shadow-sm backdrop-blur-sm select-none">
          Time: O(log n)
        </div>
        <div className="login-particle particle-4 absolute top-[78%] right-[10%] hidden md:block rounded-full border border-indigo-200/60 bg-white/60 px-3 py-1 font-mono text-xs text-indigo-600/80 shadow-sm backdrop-blur-sm select-none">
          Verdict: ACCEPTED
        </div>
        <div className="login-particle particle-5 absolute top-[44%] left-[4%] hidden lg:block rounded-full border border-cyan-200/60 bg-white/60 px-2.5 py-0.5 font-mono text-[11px] text-cyan-700/80 shadow-sm backdrop-blur-sm select-none">
          AI Interviewer active
        </div>
        <div className="login-particle particle-6 absolute top-[44%] right-[5%] hidden lg:block rounded-full border border-pink-200/60 bg-white/60 px-2.5 py-0.5 font-mono text-[11px] text-pink-600/80 shadow-sm backdrop-blur-sm select-none">
          score: 98/100
        </div>
      </div>

      {/* Academic & Code Visuals in Background */}
      <AcademicCodeBackground />

      {/* Inline styles for custom keyframe animations */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
            @keyframes blobFloat1 {
              0%, 100% { transform: translate3d(0, 0, 0) scale(1); }
              50% { transform: translate3d(50px, 60px, 0) scale(1.15); }
            }
            @keyframes blobFloat2 {
              0%, 100% { transform: translate3d(0, 0, 0) scale(1); }
              50% { transform: translate3d(-60px, -45px, 0) scale(1.12); }
            }
            @keyframes blobFloat3 {
              0%, 100% { transform: translate3d(0, 0, 0) scale(1); }
              50% { transform: translate3d(40px, -55px, 0) scale(0.92); }
            }
            @keyframes particleDrift {
              0%, 100% { transform: translateY(0px) rotate(0deg); }
              50% { transform: translateY(-16px) rotate(1.5deg); }
            }
            @keyframes gridPulse {
              0%, 100% { opacity: 0.22; }
              50% { opacity: 0.38; }
            }
            @keyframes floatSubtle1 {
              0%, 100% { transform: translateY(0px) rotate(0deg); }
              50% { transform: translateY(-10px) rotate(0.8deg); }
            }
            @keyframes floatSubtle2 {
              0%, 100% { transform: translateY(0px) rotate(0deg); }
              50% { transform: translateY(-14px) rotate(-1deg); }
            }
            @keyframes floatSubtle3 {
              0%, 100% { transform: translateY(0px) rotate(0deg); }
              50% { transform: translateY(-8px) rotate(0.6deg); }
            }
            .login-blob-1 { animation: blobFloat1 18s ease-in-out infinite; }
            .login-blob-2 { animation: blobFloat2 22s ease-in-out infinite; }
            .login-blob-3 { animation: blobFloat3 26s ease-in-out infinite; }
            .login-grid-pulse { animation: gridPulse 8s ease-in-out infinite; }
            .particle-1 { animation: particleDrift 7s ease-in-out infinite; }
            .particle-2 { animation: particleDrift 9s ease-in-out 1s infinite; }
            .particle-3 { animation: particleDrift 8s ease-in-out 2s infinite; }
            .particle-4 { animation: particleDrift 10s ease-in-out 1.5s infinite; }
            .particle-5 { animation: particleDrift 7.5s ease-in-out 3s infinite; }
            .particle-6 { animation: particleDrift 8.5s ease-in-out 0.5s infinite; }
            .login-float-subtle-1 { animation: floatSubtle1 8s ease-in-out infinite; }
            .login-float-subtle-2 { animation: floatSubtle2 10s ease-in-out 1s infinite; }
            .login-float-subtle-3 { animation: floatSubtle3 9s ease-in-out 2s infinite; }
          `,
        }}
      />

      {/* Brand Header */}
      <div className="relative z-10 flex items-center justify-between px-4 sm:px-8 max-w-7xl mx-auto w-full">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-md shadow-indigo-200">
            <Sparkles className="h-5 w-5" />
          </div>
          <span className="text-xl font-bold tracking-tight text-slate-900">
            Interview<span className="text-indigo-600">AI</span>
          </span>
        </div>
      </div>

      {/* Main Center Content */}
      <div className="my-auto py-4">
        {/* Typewriter Header */}
        <TypewriterHeader />

        {/* Login Card */}
        <div className="relative z-10 mt-6 sm:mx-auto sm:w-full sm:max-w-md">
          <div className="bg-white/85 backdrop-blur-xl py-8 px-4 shadow-2xl border border-white/80 rounded-2xl sm:px-10">
            <div className="space-y-4">
              {/* Google Sign In Form */}
              <form
                action={async () => {
                  "use server";
                  await signIn("google", { redirectTo });
                }}
              >
                <button
                  type="submit"
                  className="w-full flex justify-center items-center py-3 px-4 border border-slate-300 rounded-lg shadow-sm bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors cursor-pointer"
                >
                  <svg
                    className="w-5 h-5 mr-2"
                    viewBox="0 0 24 24"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                      fill="#4285F4"
                    />
                    <path
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                      fill="#34A853"
                    />
                    <path
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                      fill="#FBBC05"
                    />
                    <path
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                      fill="#EA4335"
                    />
                  </svg>
                  Continue with Google
                </button>
              </form>

              {/* GitHub Sign In Form */}
              <form
                action={async () => {
                  "use server";
                  await signIn("github", { redirectTo });
                }}
              >
                <button
                  type="submit"
                  className="w-full flex justify-center items-center py-3 px-4 border border-transparent rounded-lg shadow-sm bg-slate-900 text-sm font-semibold text-white hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-900 transition-colors cursor-pointer"
                >
                  <svg
                    className="w-5 h-5 mr-2"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                    aria-hidden="true"
                  >
                    <path
                      fillRule="evenodd"
                      d="M10 0C4.477 0 0 4.484 0 10.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0110 4.836c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0020 10.017C20 4.484 15.522 0 10 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                  Continue with GitHub
                </button>
              </form>

              {testLoginEnabled && (
                <form
                  className="flex gap-2 border-t pt-4"
                  action={async (formData: FormData) => {
                    "use server";
                    await signIn("test-login", {
                      name: String(formData.get("name") ?? ""),
                      redirectTo,
                    });
                  }}
                >
                  <label htmlFor="test-name" className="sr-only">
                    Test user name
                  </label>
                  <input
                    id="test-name"
                    name="name"
                    defaultValue="Test Candidate"
                    className="flex-1 rounded-lg border px-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <button
                    type="submit"
                    className="rounded-lg bg-amber-500 hover:bg-amber-600 px-3 py-2 text-sm font-semibold text-white transition-colors cursor-pointer"
                  >
                    Test login (dev only)
                  </button>
                </form>
              )}
            </div>

            {/* Divider */}
            <div className="mt-6 relative">
              <div className="absolute inset-0 flex items-center" aria-hidden="true">
                <div className="w-full border-t border-slate-200" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-white text-slate-500 text-xs">Secure access</span>
              </div>
            </div>

            <p className="mt-4 text-center text-xs text-slate-500">
              By signing in, you agree to our terms of service and privacy policy.
            </p>
          </div>
        </div>
      </div>

      {/* Motivational Quotes at Bottom */}
      <MotivationalQuotes />
    </main>
  );
}
