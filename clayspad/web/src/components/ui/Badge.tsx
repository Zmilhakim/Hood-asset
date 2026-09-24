import type { ReactNode } from "react";
import { clsx } from "@/lib/clsx";

type Tone = "signal" | "clay" | "warn";

const TONES: Record<Tone, string> = {
  signal: "border-signal/60 text-signal",
  clay: "border-clay-dark text-paper-faint",
  warn: "border-amber-500/60 text-amber-400",
};

export function Badge({ tone = "clay", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span className={clsx("micro inline-flex items-center rounded-sm border px-2 py-1 font-semibold", TONES[tone])}>
      {children}
    </span>
  );
}
