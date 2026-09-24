import Link from "next/link";

import { robinhoodChain } from "@/lib/chain";

export function SiteFooter() {
  return (
    <footer className="border-t border-clay-dark bg-ground-deep">
      <div className="mx-auto w-full max-w-6xl px-4 py-8">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <p className="max-w-prose text-sm leading-relaxed text-paper-faint">
            Clayspad is a launchpad on {robinhoodChain.name}. The supply split, the swap fee and the range are
            constants in the contracts, and the contracts are where they are published — this site reads them, it does
            not restate them.
          </p>

          <nav className="flex flex-col gap-2" aria-label="Footer">
            <Link href="/learn" className="micro text-paper-faint transition-colors hover:text-signal">
              How it works
            </Link>
            <Link href="/shelf" className="micro text-paper-faint transition-colors hover:text-signal">
              The shelf
            </Link>
          </nav>
        </div>

        <p className="mt-8 border-t border-clay-dark pt-5 text-xs leading-relaxed text-clay">
          Not audited. Nothing here is investment advice, and a token launched through this contract is not endorsed by
          it — the launchpad enforces what it enforces and makes no claim about anything launched with it.
        </p>
      </div>
    </footer>
  );
}
