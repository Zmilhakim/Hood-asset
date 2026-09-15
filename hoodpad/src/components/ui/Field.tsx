import type { InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from "react";
import { clsx } from "@/lib/clsx";

const CONTROL =
  "w-full border-2 border-ink bg-paper px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:bg-white";

function Shell({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: ReactNode;
  error?: string | null;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="micro text-ink-soft">{label}</span>
      <span className="mt-1 block">{children}</span>
      {error ? (
        <span className="micro mt-1 block font-semibold text-flame-deep">{error}</span>
      ) : hint ? (
        <span className="micro mt-1 block text-ink-faint">{hint}</span>
      ) : null}
    </label>
  );
}

export function Field({
  label,
  hint,
  error,
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: ReactNode; error?: string | null }) {
  return (
    <Shell label={label} hint={hint} error={error}>
      <input className={clsx(CONTROL, error && "border-flame-deep", className)} {...props} />
    </Shell>
  );
}

export function TextField({
  label,
  hint,
  error,
  className,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; hint?: ReactNode; error?: string | null }) {
  return (
    <Shell label={label} hint={hint} error={error}>
      <textarea className={clsx(CONTROL, "resize-y", error && "border-flame-deep", className)} {...props} />
    </Shell>
  );
}
