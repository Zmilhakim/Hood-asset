import type { ReactNode } from "react";

import { cx } from "@/lib/cx";

/** The band of slats the page drops through between one level and the next. */
export function Grate({ className }: { className?: string }) {
  return <div className={cx("h-9 grate-bars opacity-90", className)} aria-hidden />;
}

/**
 * A level of the drain. The marker in the margin is the only ornament on the
 * page that is purely an ornament, and it earns it by telling you how far down
 * you have come.
 */
export function Level({
  marker,
  title,
  children,
  className,
}: {
  marker: string;
  title?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cx("py-12 md:py-16", className)}>
      <div className="mb-5 flex items-center gap-3">
        <span className="stencil whitespace-nowrap">{marker}</span>
        <span className="h-px flex-1 bg-kerb" aria-hidden />
      </div>
      {title ? (
        <h2 className="mb-5 max-w-2xl font-display text-2xl font-extrabold leading-[1.05] text-chalk md:text-3xl">
          {title}
        </h2>
      ) : null}
      {children}
    </section>
  );
}
