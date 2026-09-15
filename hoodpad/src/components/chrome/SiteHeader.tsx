"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { ConnectControl } from "./ConnectControl";
import { Mark } from "@/components/ui/Mark";
import { clsx } from "@/lib/clsx";

const NAV = [
  { href: "/", label: "Board" },
  { href: "/launch", label: "Launch" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/learn", label: "Learn" },
] as const;

export function SiteHeader() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  return (
    <header className="border-b-2 border-ink bg-paper text-ink">
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
        <Link href="/" className="flex shrink-0 items-center gap-2.5" onClick={() => setOpen(false)}>
          <Mark />
          <span>
            <span className="font-display block text-lg leading-none tracking-wide">HOODPAD</span>
            <span className="micro hidden text-ink-faint sm:block">Plain tools for Robinhood Chain</span>
          </span>
        </Link>

        <nav className="ml-auto hidden items-center gap-1 md:flex">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={clsx(
                "micro border-2 px-3 py-2 font-semibold",
                isActive(item.href)
                  ? "border-ink bg-ink text-paper"
                  : "border-transparent text-ink-soft hover:border-ink hover:bg-paper-dim hover:text-ink",
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2 md:ml-2">
          <ConnectControl />
          <button
            type="button"
            className="micro border-2 border-ink px-2.5 py-2 font-semibold md:hidden"
            aria-expanded={open}
            aria-controls="mobile-nav"
            onClick={() => setOpen((value) => !value)}
          >
            {open ? "Close" : "Menu"}
          </button>
        </div>
      </div>

      {open && (
        <nav id="mobile-nav" className="border-t-2 border-ink bg-paper-dim md:hidden">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              className={clsx(
                "micro block border-b border-ink/15 px-4 py-3 font-semibold",
                isActive(item.href) ? "bg-ink text-paper" : "text-ink-soft",
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      )}
    </header>
  );
}
