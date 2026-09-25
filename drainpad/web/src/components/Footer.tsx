import Link from "next/link";

import { DRAINPAD, GRATE, SUMP, DEPLOYER } from "@/lib/contracts";
import { explorerAddress } from "@/lib/chain";
import { SITE, shortAddress } from "@/lib/site";

const CONTRACTS = [
  { name: "Drainpad", address: DRAINPAD, what: "the catchment" },
  { name: "Grate", address: GRATE, what: "the fee hook" },
  { name: "Sump", address: SUMP, what: "the liquidity" },
];

export function Footer() {
  return (
    <footer className="mt-16 border-t border-kerb">
      <div className="h-8 grate-bars opacity-40" aria-hidden />
      <div className="mx-auto max-w-5xl px-5 py-10 md:px-8">
        <div className="grid gap-8 md:grid-cols-[1.2fr_1fr]">
          <div>
            <div className="font-display text-lg font-extrabold uppercase text-chalk">{SITE.name}</div>
            <p className="mt-2 max-w-sm text-sm leading-relaxed text-grit">
              Everything the contracts hold to is in their source, verified and published under MIT. Read it there
              rather than taking a page&apos;s word for it.
            </p>
            <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2">
              <Link href="/how" className="stencil-dim transition-colors hover:text-paint">
                Where it goes
              </Link>
              <Link href="/catchment" className="stencil-dim transition-colors hover:text-paint">
                Catchment
              </Link>
              <a
                href="https://github.com/Zmilhakim/Hood-asset/tree/drainpad/drainpad"
                target="_blank"
                rel="noreferrer"
                className="stencil-dim transition-colors hover:text-paint"
              >
                Source
              </a>
            </div>
          </div>

          <div>
            <div className="stencil mb-3">On chain</div>
            <ul className="space-y-2">
              {CONTRACTS.map((contract) => (
                <li key={contract.address} className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-sm text-chalk">
                    {contract.name} <span className="text-grit-dim">· {contract.what}</span>
                  </span>
                  <a
                    href={explorerAddress(contract.address)}
                    target="_blank"
                    rel="noreferrer"
                    className="figure text-xs text-grit underline decoration-kerb-bright underline-offset-4 hover:text-paint"
                  >
                    {shortAddress(contract.address, 8, 6)}
                  </a>
                </li>
              ))}
            </ul>
            <div className="mt-4 border-t border-kerb pt-3 text-xs text-grit-dim">
              Deployer{" "}
              <a
                href={explorerAddress(DEPLOYER)}
                target="_blank"
                rel="noreferrer"
                className="figure underline decoration-kerb underline-offset-4 hover:text-paint"
              >
                {DEPLOYER}
              </a>
            </div>
          </div>
        </div>

        <p className="mt-8 border-t border-kerb pt-5 text-xs text-grit-dim">
          Not audited. Nothing here is advice, and a launch cannot be undone.
        </p>
      </div>
    </footer>
  );
}
