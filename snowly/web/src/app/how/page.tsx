import type { Metadata } from "next";

import { Panel } from "@/components/ui/Panel";
import { explorerAddress } from "@/lib/chain";
import { GLACIER, SNOWLY, SNOW_HOOK } from "@/lib/contracts";

export const metadata: Metadata = {
  title: "How it works",
  description: "What a Snowly launch does, what is fixed, and what it honestly does not restrain.",
};

export default function HowPage() {
  return (
    <div className="space-y-8">
      <header className="max-w-2xl">
        <h1 className="text-2xl md:text-3xl">How it works</h1>
        <p className="mt-3 text-[0.9375rem] leading-relaxed text-stone-soft">
          Four contracts, and nothing behind them. There is no owner, no pause, no upgrade path and no admin key
          anywhere in this system.
        </p>
      </header>

      <Section title="A launch is one transaction">
        <p>
          It deploys the token, whose constructor mints the entire fixed supply and splits it there and then
          between the glacier and a wallet the creator names. Neither share ever passes through the launchpad,
          and both mints appear in the launch receipt.
        </p>
        <p>
          Then it opens a Uniswap v4 pool of native ETH against the token — LP fee zero, the hook in the key —
          priced at the top of the launch range, and puts the glacier’s share in as one position.
        </p>
      </Section>

      <Section title="What the glacier cannot do">
        <p>
          Liquidity leaves a v4 pool through exactly one door: a `modifyLiquidity` call with a negative delta.
          The only such call in that contract passes a positive one. There is no withdraw, no owner, no pause, no
          emergency hatch and no upgrade path — and the position is a row in the pool manager rather than an NFT,
          so there is no object to transfer, sell or lend against either.
        </p>
      </Section>

      <Section title="The fee is fixed by the pool’s own key">
        <p>
          A fee is taken on everything paid into a pool, in either direction, and split between whoever launched
          the token and the treasury. Both figures are constants with no setter — read them off the hook rather
          than from this page.
        </p>
        <p>
          A pool’s hook is part of its key, so the rate is decided when the pool is opened and cannot be raised
          or switched off afterwards. A different hook is not this pool with a different rate; it is a different
          pool. And because the pool’s own LP fee is zero, the hook’s rate is the entire fee schedule.
        </p>
      </Section>

      <Section title="What this does not restrain" tone="warn">
        <p>
          The share minted to the supply wallet is liquid from the first block. Not vested, not cliffed, not
          locked — the token contract has no machinery for any of those, and nothing here pretends otherwise.
          Whoever holds that wallet can sell into any bid that appears.
        </p>
        <p>
          It is a constant rather than a per-launch setting, so there is one number to check rather than one per
          token, and it is checked in the contract. What that wallet cannot do on day one is sell into a pool
          holding no ETH: the whole position is still token until somebody buys.
        </p>
      </Section>

      <Panel className="px-5 py-5">
        <h2 className="text-base">Read them yourself</h2>
        <p className="mt-2 text-sm text-stone-soft">
          All three are verified, with the source published under MIT. Every figure this page describes in words
          is a named constant in there — that is where it is binding, and where it is worth checking.
        </p>
        <ul className="mt-3 space-y-1.5 text-sm">
          {[
            ["Snowly — the launchpad", SNOWLY],
            ["SnowHook — the fee", SNOW_HOOK],
            ["Glacier — the liquidity", GLACIER],
          ].map(([label, address]) => (
            <li key={address}>
              <a
                href={explorerAddress(address)}
                target="_blank"
                rel="noreferrer"
                className="figure text-melt transition hover:text-melt-deep"
              >
                {label} ↗
              </a>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}

function Section({
  title,
  children,
  tone = "plain",
}: {
  title: string;
  children: React.ReactNode;
  tone?: "plain" | "warn";
}) {
  return (
    <Panel accent={tone === "warn"} className="px-5 py-5">
      <h2 className="text-base">{title}</h2>
      <div className={`mt-2 space-y-3 text-sm leading-relaxed ${tone === "warn" ? "text-stone" : "text-stone-soft"}`}>
        {children}
      </div>
    </Panel>
  );
}
