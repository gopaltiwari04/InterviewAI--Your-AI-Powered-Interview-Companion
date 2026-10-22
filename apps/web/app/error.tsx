"use client";

import React, { useEffect } from "react";
import Link from "next/link";
import { AlertCircle, RefreshCw, Home } from "lucide-react";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("App boundary error caught:", error);
  }, [error]);

  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-slate-50 px-4 py-12">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl border border-slate-200/80 p-8 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-rose-50 text-rose-600 mb-5">
          <AlertCircle className="h-8 w-8" />
        </div>

        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Something went wrong
        </h1>
        <p className="mt-2 text-sm text-slate-600 leading-relaxed">
          An unexpected error occurred while loading this page. This could be due to a transient connection or configuration issue.
        </p>

        {error?.digest && (
          <p className="mt-2 text-xs font-mono text-slate-400">
            Error ID: {error.digest}
          </p>
        )}

        <div className="mt-6 flex flex-col sm:flex-row gap-3 justify-center">
          <button
            onClick={() => reset()}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 transition-colors shadow-sm cursor-pointer"
          >
            <RefreshCw className="h-4 w-4" />
            Try again
          </button>
          <Link
            href="/login"
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-slate-300 bg-white text-slate-700 text-sm font-semibold hover:bg-slate-50 transition-colors shadow-sm"
          >
            <Home className="h-4 w-4" />
            Back to login
          </Link>
        </div>
      </div>
    </main>
  );
}
