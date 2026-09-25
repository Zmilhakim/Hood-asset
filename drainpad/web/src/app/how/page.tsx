import type { Metadata } from "next";
import Link from "next/link";

import { Address } from "@/components/Address";
import { Grate, Level } from "@/components/Section";
import { DRAINPAD, GRATE, SUMP } from "@/lib/contracts";

export const metadata: Metadata = {
  title: "Where it goes",
  description:
    "What a pour actually does, what the grate keeps, and why the sump has no way to give a position back.",
};

export default function HowPage() {
  return (
    <>
      <section className="pt-12 pb-8 md:pt-16">
        <p className="stencil mb-4">Where it goes</p>
        <h1 className="max-w-3xl font-display text-4xl font-extrabold leading-[0.95] tracking-[-0.03em] text-chalk md:text-6xl">
          Down is the only direction this thing has
        </h1>
        <p className="mt-6 max-w-2xl text-lg leading-relaxed text-grit">
          Three contracts, and a launched token makes a fourth. Every one of them is verified on the explorer with its
          source published under MIT, so none of what follows has to be taken on trust.
        </p>
      </section>

      <Grate />

      <Level marker="The pour" title="What one transaction does">
        <ol className="space-y-5">
          {[
            {
              head: "It prints the supply and splits it at once",
              body: "Both mints happen inside the token's constructor and both appear as transfers from the zero address, so who got what is in the launch transaction rather than in anybody's word for it. There is no mint function afterwards. No owner, no pause, no blacklist, no upgrade path.",
            },
            {
              head: "It opens the pool",
              body: "Native ETH against the token, on Uniswap v4, with the grate in the pool's key and no LP fee at all. Native ETH is address zero, so it is always the lower currency and the launched token is always the other side — there is no WETH and no ordering to discover.",
            },
            {
              head: "It sends the pool's share down",
              body: "Into the sump, as one position, below the opening price. Below, because a pool that opens above its whole range is a pool asking only for the token — so the first buy fills immediately and the sump is never asked for ETH it does not have.",
            },
          ].map((item, i) => (
            <li key={item.head} className="slab flex gap-5 p-5">
              <span className="stencil pt-1">{String(i + 1).padStart(2, "0")}</span>
              <div>
                <h3 className="font-display text-base font-bold uppercase text-chalk">{item.head}</h3>
                <p className="mt-2 max-w-2xl text-sm leading-relaxed text-grit">{item.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </Level>

      <Grate />

      <Level marker="The grate" title="A share of everything that crosses it">
        <div className="max-w-2xl space-y-4 text-base leading-relaxed text-grit">
          <p>
            Every pool charges on the way in, both directions. Buy with ETH and the charge is kept in ETH; sell the
            token back and it is kept in the token. What is kept is split between whoever poured the token and the
            treasury, and neither side of that split has a setter.
          </p>
          <p>
            A pool&apos;s hook is part of its key, which means the rate is fixed the moment the pool is opened. Not
            governed, not timelocked, not voted on: a different hook would be a different pool, not this one with the
            rate changed.
          </p>
          <p>
            It is banked as a claim against the pool manager rather than lifted as cash mid-swap. Lifting cash at that
            point would revert on a pool that holds no ETH yet — which every pool is until its first buy — and the
            launch would simply be unbuyable. The claim is redeemed later, in a transaction of its own.
          </p>
          <p className="text-grit-dim">
            The rate and the split are constants in the grate&apos;s source. Read them there; this page will not repeat
            a figure the contract already states better.
          </p>
        </div>
      </Level>

      <Grate />

      <Level marker="The sump" title="There is no pump on it">
        <div className="max-w-2xl space-y-4 text-base leading-relaxed text-grit">
          <p>
            Liquidity leaves a Uniswap v4 pool through exactly one door — a <span className="figure">modifyLiquidity</span>{" "}
            call with a negative delta. Search the sump&apos;s source for one. There is not one: the only such call in
            that contract passes a positive delta.
          </p>
          <p>
            No withdraw, no owner, no pause, no emergency hatch, no upgrade path. And a v4 position is not an NFT — it
            is a row in the pool manager keyed by the address that added it — so there is no object to sell, lend
            against, or approve away by accident.
          </p>
          <p>
            One sump holds every launch, keyed per pool, so no launch can reach into another&apos;s liquidity.
          </p>
        </div>
      </Level>

      <Grate />

      <Level marker="The honest part" title="The share that is not locked">
        <div className="max-w-2xl space-y-4 text-base leading-relaxed text-grit">
          <p>
            Part of every supply is minted straight to a wallet the creator nominates, and it is liquid from the first
            block. Not vested, not cliffed, not locked. No contract here restrains it and none of them pretends to —
            the token has no machinery for it at all.
          </p>
          <p>
            That is the honest cost of this design, and it is worth reading as exactly what it says: whoever holds that
            wallet can sell into any bid that appears. The launchpad&apos;s job is not to stop them. It is to make sure
            nobody had to guess.
          </p>
          <p>
            One thing that share is not, on day one: sellable. A pool nobody has bought from holds no ETH, so there is
            nothing to pay a seller with. It becomes sellable only as the pool fills.
          </p>
        </div>
      </Level>

      <Grate />

      <Level marker="On chain" title="Where to check all of it">
        <div className="slab space-y-5 p-5">
          <Address label="Drainpad · the catchment" value={DRAINPAD} />
          <Address label="Grate · the fee hook" value={GRATE} />
          <Address label="Sump · the liquidity" value={SUMP} />
        </div>
        <p className="mt-5 max-w-2xl text-sm leading-relaxed text-grit-dim">
          Each one is verified with its source published under MIT. An address on a page is the one thing a reader
          cannot check by reading the page, so check these on the explorer before trusting anything here.
        </p>
        <Link
          href="/pour"
          className="mt-6 inline-block border border-paint px-5 py-3 font-display text-sm font-bold uppercase tracking-[0.14em] text-paint transition-colors hover:bg-paint hover:text-asphalt-deep"
        >
          Pour a token
        </Link>
      </Level>
    </>
  );
}
