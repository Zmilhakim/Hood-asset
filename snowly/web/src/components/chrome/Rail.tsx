"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { Mark } from "@/components/brand/Mark";
import { Wallet } from "@/components/chrome/Wallet";
import { cx } from "@/lib/cx";

const LINKS = [
  { href: "/", label: "Overview" },
  { href: "/snowfield", label: "Snowfield" },
  { href: "/launch", label: "Launch" },
  { href: "/fees", label: "Your fees" },
  { href: "/how", label: "How it works" },
];

/**
 * The rail: navigation down the left rather than across the top.
 *
 * The snowfield is a list that wants the full height of the window, and a
 * horizontal header spends the one dimension it needs most. On a phone the rail
 * lies down and becomes a scrolling strip, which is the same list in the space
 * that is actually available.
 */
export function Rail() {
  const pathname = usePathname();

  const isCurrent = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  return (
    <nav className="flex shrink-0 flex-col gap-6 border-rime bg-surface/70 px-4 py-4 backdrop-blur max-md:border-b md:h-dvh md:w-56 md:border-r md:px-5 md:py-6 md:sticky md:top-0">
      <Link href="/" className="flex items-center gap-2.5 text-stone transition hover:text-melt">
        <Mark size={26} className="text-melt" />
        <span className="font-display text-lg font-semibold tracking-tight">Snowly</span>
      </Link>

      <ul className="flex gap-1 overflow-x-auto md:flex-1 md:flex-col md:overflow-visible">
        {LINKS.map((link) => (
          <li key={link.href}>
            <Link
              href={link.href}
              className={cx(
                "block whitespace-nowrap rounded-md px-3 py-2 text-sm transition",
                isCurrent(link.href)
                  ? "bg-melt-wash font-medium text-melt-deep"
                  : "text-stone-soft hover:bg-field-deep hover:text-stone",
              )}
            >
              {link.label}
            </Link>
          </li>
        ))}
      </ul>

      <div className="max-md:hidden">
        <Wallet />
        <p className="mt-3 text-[0.6875rem] leading-relaxed text-stone-faint">
          Robinhood Chain · 4663
          <br />
          Not audited. Read the contracts.
        </p>
      </div>
    </nav>
  );
}
