import Link from "next/link";
import { ROBINHOOD_CHAIN_ID } from "@/lib/chain";
import { X_HANDLE, X_URL } from "@/lib/brand";

export function SiteFooter() {
  return (
    <footer className="mt-12 border-t-2 border-paper/15">
      <div className="mx-auto grid max-w-6xl gap-4 px-4 py-8 sm:grid-cols-[1fr_auto] sm:items-end">
        <div className="space-y-1.5">
          <p className="font-display text-base text-paper">Supply is fixed. The pool position is locked forever.</p>
          <p className="micro text-paper/50">
            Chain {ROBINHOOD_CHAIN_ID} · Every figure on this site is read from the board contract
          </p>
        </div>
        <nav className="micro flex flex-wrap gap-x-4 gap-y-2 text-paper/60">
          <Link href="/board" className="hover:text-flame">
            The board
          </Link>
          <Link href="/learn" className="hover:text-flame">
            How it works
          </Link>
          <Link href="/launch" className="hover:text-flame">
            Post a notice
          </Link>
          <Link href="/dashboard" className="hover:text-flame">
            Your notices
          </Link>
          <a
            href={X_URL}
            target="_blank"
            rel="noreferrer noopener"
            className="font-semibold text-paper/80 hover:text-flame"
          >
            {X_HANDLE} ↗
          </a>
        </nav>
      </div>
    </footer>
  );
}
