"use client";

import type { ButtonHTMLAttributes } from "react";

import { cx } from "@/lib/cx";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "solid" | "quiet" };

export function Button({ variant = "solid", className, ...props }: Props) {
  return (
    <button
      {...props}
      className={cx(
        "inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium transition",
        "disabled:cursor-not-allowed disabled:opacity-45",
        variant === "solid" && "bg-melt text-white hover:bg-melt-deep",
        variant === "quiet" && "border border-rime bg-surface text-stone hover:border-melt hover:text-melt",
        className,
      )}
    />
  );
}
