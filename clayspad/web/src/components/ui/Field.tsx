import type { ComponentProps, ReactNode } from "react";

const INPUT =
  "w-full rounded-sm border border-clay-dark bg-ground-deep px-3 py-2.5 text-sm text-paper " +
  "placeholder:text-clay focus:border-signal focus:outline-none";

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="micro text-paper-faint">{label}</span>
      <span className="mt-1.5 block">{children}</span>
      {hint ? <span className="mt-1.5 block text-xs leading-relaxed text-paper-faint">{hint}</span> : null}
    </label>
  );
}

export function Input(props: ComponentProps<"input">) {
  return <input className={INPUT} {...props} />;
}

export function Textarea(props: ComponentProps<"textarea">) {
  return <textarea className={INPUT} rows={3} {...props} />;
}
