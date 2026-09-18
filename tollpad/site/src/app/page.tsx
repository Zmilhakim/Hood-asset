import Link from "next/link";

import { BoardStats } from "@/components/board/BoardStats";
import { DeploymentNotice } from "@/components/board/DeploymentNotice";
import { buttonClasses } from "@/components/ui/Button";
import { Panel } from "@/components/ui/Panel";
import { ROBINHOOD_CHAIN_ID } from "@/lib/chain";
import { clsx } from "@/lib/clsx";

/** The hero's figures. `wide` takes a whole row where a half one is too narrow. */
const FACTS: Array<[label: string, value: string, wide: boolean]> = [
  ["Toll", "5%", false],
  ["To the creator", "80%", false],
  ["Pool fee", "None", false],
  ["Liquidity", "Locked", false],
  ["Supply", "1,000,000,000", true],
  ["To launch", "Gas", true],
];

const STEPS = [
  {
    title: "You launch",
    body: "One transaction mints a billion tokens straight to the locker, opens a Uniswap v4 pool against native ETH, and puts the entire supply in. It costs gas and nothing else.",
  },
  {
    title: "The pool shuts behind it",
    body: "The liquidity goes into a contract with no function that takes any out. Not for you, not for us, not by vote. A v4 position is a row in the pool manager rather than an NFT, so there is nothing to sell or approve away either.",
  },
  {
    title: "Every swap pays the toll",
    body: "5% of everything paid into the pool, in either direction. Buys pay it in ETH, sells pay it in the token. 80% of it is yours, for as long as anyone trades.",
  },
];

export default function Home() {
  return (
    <div className="space-y-8">
      <DeploymentNotice />

      <section className="border-2 border-signal/45 bg-ground-soft drop">
        <div className="hazard h-3" />
        <div className="grid gap-8 p-6 sm:p-9 lg:grid-cols-[1.35fr_1fr]">
          <div>
            <span className="micro font-semibold text-signal">Launch a token. Charge a toll.</span>
            <h1 className="font-display mt-3 text-4xl leading-[1.08] text-lane sm:text-5xl">
              Every swap pays a toll
            </h1>
            <p className="mt-4 max-w-xl text-sm leading-relaxed text-lane-soft sm:text-base">
              Tollpad is a launchpad where the fee is the product. The supply goes into the pool, the pool is locked,
              and from the first trade onwards every swap pays <strong className="text-lane">5%</strong> —{" "}
              <strong className="text-lane">80% of it</strong> to whoever launched the token.
            </p>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-lane-soft">
              No presale, no allocation, no unlock schedule. There is nowhere to put one: the supply has exactly one
              destination and it is the pool.
            </p>

            <div className="mt-6 flex flex-wrap gap-2.5">
              <Link href="/launch" className={buttonClasses("signal")}>
                Launch a token
              </Link>
              <Link href="/board" className={buttonClasses("quiet")}>
                Read the board
              </Link>
              <Link href="/learn" className={buttonClasses("ghost")}>
                How it works
              </Link>
            </div>
          </div>

          <dl className="grid grid-cols-2 gap-px self-start border-2 border-signal/40 bg-signal/40">
            {FACTS.map(([label, value, wide]) => (
              <div
                key={label}
                className={clsx(
                  "min-w-0 bg-ground-soft px-3 py-2.5 sm:px-4 sm:py-3",
                  // A phone's half-column is about 90px of content, and the
                  // supply is thirteen characters of monospace. No font size
                  // fits it there, so the long ones take a whole row instead of
                  // spilling out of the box — a figure that leaves its cell
                  // reads as a broken page, which is not what a launchpad wants
                  // to be saying on the line about supply.
                  wide && "col-span-2 sm:col-span-1",
                )}
              >
                <dt className="micro text-lane-soft">{label}</dt>
                <dd className="mt-1 text-lg font-semibold tabular-nums whitespace-nowrap text-lane">{value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <BoardStats />

      <section className="grid gap-4 md:grid-cols-3">
        {STEPS.map((step, index) => (
          <Panel key={step.title} label={`Step ${index + 1}`}>
            <h2 className="font-display text-lg text-lane">{step.title}</h2>
            <p className="mt-2 text-sm leading-relaxed text-lane-soft">{step.body}</p>
          </Panel>
        ))}
      </section>

      <Panel label="The part worth being clear-eyed about">
        <p className="text-sm leading-relaxed text-lane-soft">
          Locked liquidity means locked. Everything anyone pays to buy a token becomes liquidity and does not come back
          out — for the creator as much as for anyone else. The toll comes out; the liquidity does not. Those are two
          different promises and it is worth knowing which is which.
        </p>
        <p className="mt-3 text-sm leading-relaxed text-lane-soft">
          Nothing here is audited. The contracts are on Uniswap v4 on Robinhood Chain ({ROBINHOOD_CHAIN_ID}), and every
          figure this site shows is read from the pool manager or the factory rather than from a database.
        </p>
      </Panel>
    </div>
  );
}
