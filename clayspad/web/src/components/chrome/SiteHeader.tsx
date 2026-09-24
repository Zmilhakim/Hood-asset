import Link from "next/link";

import { Lockup } from "@/components/brand/Mark";
import { ConnectControl } from "@/components/chrome/ConnectControl";
import { robinhoodChain } from "@/lib/chain";

const NAV = [
  { href: "/shelf", label: "Shelf" },
  { href: "/launch", label: "Launch" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/learn", label: "How it works" },
];

export function SiteHeader() {
  return (
    <header className="border-b border-clay-dark bg-ground-deep/80 backdrop-blur">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3">
        <Link href="/" className="shrink-0">
          <Lockup />
        </Link>

        <nav className="order-3 flex w-full gap-5 sm:order-none sm:w-auto" aria-label="Main">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="micro font-semibold text-paper-faint transition-colors hover:text-signal"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-3">
          <span className="micro hidden text-paper-faint sm:inline">{robinhoodChain.name}</span>
          <ConnectControl />
        </div>
      </div>
    </header>
  );
}
