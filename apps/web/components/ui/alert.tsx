import * as React from "react";
import { cn } from "@/lib/utils";

const tones = {
  info: "border-indigo-200 bg-indigo-50 text-indigo-900 dark:border-indigo-900 dark:bg-indigo-950/50 dark:text-indigo-100",
  warning: "border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100",
  danger: "border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-100",
  success: "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100",
} as const;

export function Alert({ tone = "info", className, ...props }: React.ComponentProps<"div"> & { tone?: keyof typeof tones }) {
  return <div role={tone === "danger" ? "alert" : "status"} className={cn("rounded-lg border px-3 py-2 text-sm", tones[tone], className)} {...props} />;
}
