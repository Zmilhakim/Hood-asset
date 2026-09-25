"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { cx } from "@/lib/cx";
import { Wallet } from "./Wallet";

const LINKS = [
  { href: "/catchment", label: "Catchment" },
  { href: "/how", label: "Where it goes" },
  { href: "/pour", label: "Pour" },
  { href: "/grate", label: "Grate" },
];

export function Header() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-kerb bg-asphalt/92 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center gap-4 px-5 py-4 md:px-8">
        <Link href="/" className="group flex items-baseline gap-2" onClick={() => setOpen(false)}>
          <span className="font-display text-xl font-extrabold uppercase tracking-tight text-chalk">Drainpad</span>
          <span className="hidden h-2 w-8 grate-bars sm:block" aria-hidden />
        </Link>

        <nav className="ml-auto hidden items-center gap-1 md:flex">
          {LINKS.map((link) => {
            const active = pathname === link.href || pathname.startsWith(`${link.href}/`);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={cx(
                  "px-3 py-2 font-display text-xs font-bold uppercase tracking-[0.14em] transition-colors",
                  active ? "text-paint" : "text-grit hover:text-chalk",
                )}
              >
                {link.label}
              </Link>
            );
          })}
          <Wallet />
        </nav>

        <button
          type="button"
          onClick={() => setOpen((was) => !was)}
          aria-expanded={open}
          aria-label="Menu"
          className="ml-auto flex h-9 w-9 flex-col items-center justify-center gap-[3px] border border-kerb md:hidden"
        >
          <span className="h-[2px] w-4 bg-chalk" />
          <span className="h-[2px] w-4 bg-chalk" />
          <span className="h-[2px] w-4 bg-chalk" />
        </button>
      </div>

      {open ? (
        <div className="border-t border-kerb md:hidden">
          <div className="mx-auto max-w-5xl px-5 py-3">
            {LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className="block border-b border-kerb/60 py-3 font-display text-sm font-bold uppercase tracking-[0.14em] text-chalk last:border-0"
              >
                {link.label}
              </Link>
            ))}
            <div className="pt-3">
              <Wallet />
            </div>
          </div>
        </div>
      ) : null}

      <div className="h-[3px] hazard opacity-60" aria-hidden />
    </header>
  );
}
