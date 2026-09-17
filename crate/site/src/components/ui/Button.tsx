import type { ButtonHTMLAttributes } from "react";

type Tone = "seal" | "quiet";

const tones: Record<Tone, string> = {
  seal: "bg-[var(--seal)] text-white border-transparent hover:brightness-110",
  quiet: "bg-transparent text-ink border-[var(--line-strong)] hover:bg-[var(--paper-deep)]",
};

export function Button({
  tone = "quiet",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { tone?: Tone }) {
  return (
    <button
      {...props}
      className={`stencil inline-flex items-center justify-center gap-2 rounded-[3px] border px-4 py-2.5 text-sm transition disabled:cursor-not-allowed disabled:opacity-45 ${tones[tone]} ${className}`}
    />
  );
}
