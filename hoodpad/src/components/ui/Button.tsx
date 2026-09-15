import type { ButtonHTMLAttributes } from "react";
import { clsx } from "@/lib/clsx";

export type ButtonTone = "flame" | "ink" | "quiet";

const TONES: Record<ButtonTone, string> = {
  flame: "border-ink bg-flame text-ink hover:bg-flame-deep hover:text-paper",
  ink: "border-ink bg-ink text-paper hover:bg-wood-deep",
  quiet: "border-ink bg-paper text-ink hover:bg-paper-dim",
};

export function buttonClasses(tone: ButtonTone = "flame", className?: string) {
  return clsx(
    "micro pin-shadow-sm inline-flex items-center justify-center gap-2 border-2 px-3 py-2 font-semibold",
    "transition-[background-color,color,transform] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none",
    "disabled:pointer-events-none disabled:opacity-45",
    TONES[tone],
    className,
  );
}

export function Button({
  tone = "flame",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { tone?: ButtonTone }) {
  return <button className={buttonClasses(tone, className)} {...props} />;
}
