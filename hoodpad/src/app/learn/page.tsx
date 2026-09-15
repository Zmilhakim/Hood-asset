import type { Metadata } from "next";
import Link from "next/link";

import { Badge } from "@/components/ui/Badge";
import { buttonClasses } from "@/components/ui/Button";
import { Panel } from "@/components/ui/Panel";
import { ROBINHOOD_CHAIN_ID } from "@/lib/chain";
import { LAUNCH_FEE_TIER } from "@/lib/contracts";

const STEPS = [
  {
    step: "01",
    title: "The supply is minted",
    body: "One billion tokens, all at once, straight to the factory. There is no mint function on the token, no owner and no pause — what is printed in that transaction is the supply for good.",
  },
  {
    step: "02",
    title: "A single-sided pool opens",
    body: `Every one of those tokens goes into a ${LAUNCH_FEE_TIER / 10_000}% pool on its own, priced from your opening valuation up to your ceiling. No ETH is needed to open it and none is taken from you, because the range sits entirely above the starting price. The contract checks that before it mints the position.`,
  },
  {
    step: "03",
    title: "The position is locked",
    body: "The position goes to a locker with no withdraw function, no transfer and no way to reassign it. The only thing that can ever leave is trading fees, and those stay claimable by the address that posted the notice.",
  },
] as const;

export const metadata: Metadata = {
  title: "Learn",
  description: "What Hoodpad does in one transaction, what is fixed, and what is not.",
};

export default function LearnPage() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-3xl leading-tight sm:text-4xl">The rules of the board</h1>
        <p className="mt-2 max-w-prose text-sm leading-6 text-paper/70">
          Hoodpad is deliberately small. It does one thing, it does it in a single transaction, and every figure it
          shows you comes back out of the chain.
        </p>
      </div>

      <Panel label="One transaction" aside={<Badge tone="flame">Chain {ROBINHOOD_CHAIN_ID}</Badge>}>
        <ol className="space-y-5">
          {STEPS.map((item) => (
            <li key={item.step} className="grid gap-3 sm:grid-cols-[auto_1fr] sm:gap-5">
              <span className="font-display text-3xl leading-none text-flame-deep">{item.step}</span>
              <div>
                <h2 className="font-display text-xl leading-tight">{item.title}</h2>
                <p className="mt-1.5 max-w-prose text-sm leading-6 text-ink-soft">{item.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </Panel>

      <div className="grid gap-5 md:grid-cols-2">
        <Panel label="What is fixed">
          <ul className="space-y-2.5 text-sm leading-6 text-ink-soft">
            <li>— Supply is one billion on every launch. It is a constant, not a form field.</li>
            <li>— No launch keeps a team allocation. The whole supply goes into the pool, and rounding dust is burnt.</li>
            <li>— The pool position cannot be withdrawn, by you or by us.</li>
            <li>— The token address is computed with CREATE2, so you can read it before you sign.</li>
          </ul>
        </Panel>

        <Panel label="What is not guaranteed">
          <ul className="space-y-2.5 text-sm leading-6 text-ink-soft">
            <li>— A locked pool is not a safe investment. It says nothing about whether a token is worth buying.</li>
            <li>— Names, tickers, art and links are typed in by whoever posted them. None of it is checked.</li>
            <li>— Anyone can post a notice that imitates another one. Read the token address, not the name.</li>
            <li>— Fees accrue to the poster, so a launch is not free of incentives just because liquidity is locked.</li>
          </ul>
        </Panel>
      </div>

      <Panel label="Check it yourself">
        <p className="max-w-prose text-sm leading-6 text-ink-soft">
          Nothing on this site is computed on a server you have to trust. The board contract holds every notice, and
          the numbers in the tiles come from one <code className="text-ink">boardStats()</code> call. Read it from a
          block explorer, or point the app at your own RPC and compare.
        </p>
        <div className="mt-5 flex flex-wrap gap-2.5">
          <Link href="/" className={buttonClasses("flame")}>
            Back to the board
          </Link>
          <Link href="/launch" className={buttonClasses("quiet")}>
            Post a notice
          </Link>
        </div>
      </Panel>
    </div>
  );
}
