import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { clsx } from "@/lib/clsx";

type Tone = "signal" | "quiet" | "ghost";

const TONES: Record<Tone, string> = {
  signal: "bg-signal text-ground hover:bg-signal-hot border-signal",
  quiet: "bg-ground-soft text-paper hover:border-clay border-clay-dark",
  ghost: "bg-transparent text-paper-faint hover:text-paper border-transparent hover:border-clay-dark",
};

const BASE =
  "inline-flex items-center justify-center gap-2 rounded-sm border px-4 py-2.5 text-sm font-semibold " +
  "transition-colors disabled:cursor-not-allowed disabled:opacity-45";

export function Button({
  tone = "quiet",
  className,
  ...props
}: ComponentProps<"button"> & { tone?: Tone }) {
  return <button className={clsx(BASE, TONES[tone], className)} {...props} />;
}

export function ButtonLink({
  tone = "quiet",
  className,
  children,
  href,
}: {
  tone?: Tone;
  className?: string;
  children: ReactNode;
  href: string;
}) {
  return (
    <Link href={href} className={clsx(BASE, TONES[tone], className)}>
      {children}
    </Link>
  );
}
