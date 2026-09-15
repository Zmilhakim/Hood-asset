import type { ReactNode } from "react";
import { clsx } from "@/lib/clsx";

type BadgeTone = "live" | "idle" | "flame";

const TONES: Record<BadgeTone, string> = {
  live: "border-moss bg-moss/15 text-moss",
  idle: "border-ink-faint bg-paper-deep/50 text-ink-soft",
  flame: "border-flame bg-flame/20 text-flame-deep",
};

export function Badge({ tone = "idle", children }: { tone?: BadgeTone; children: ReactNode }) {
  return (
    <span className={clsx("micro inline-flex items-center gap-1.5 border px-2 py-0.5 font-semibold", TONES[tone])}>
      {tone === "live" && <span className="size-1.5 shrink-0 rounded-full bg-moss" />}
      {children}
    </span>
  );
}
