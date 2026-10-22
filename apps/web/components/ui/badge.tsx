import * as React from "react";
import { cn } from "@/lib/utils";

const tones = {
  neutral: "bg-muted text-foreground",
  info: "bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-200",
  success: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  warning: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  danger: "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200",
} as const;

export type BadgeTone = keyof typeof tones;

export function Badge({ tone = "neutral", className, ...props }: React.ComponentProps<"span"> & { tone?: BadgeTone }) {
  return <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium", tones[tone], className)} {...props} />;
}
