import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "How it works",
  description: "What a Clayspad launch does, what it guarantees, and what it deliberately does not.",
};

const SECTIONS = [
  {
    title: "A launch is one transaction",
    body: [
      "The token is deployed and its whole supply is minted in its own constructor, split between exactly two addresses: the kiln, which puts its share into the pool, and a wallet the creator nominates.",
      "A Uniswap v4 pool of native ETH against the token is opened, with the fee hook in its key and an LP fee of zero. The kiln's share goes in as one position, priced at the top of the launch range so the first buy fills immediately.",
      "The creator ends the transaction owning no position and holding no pool tokens. What they own is a share of the fee on every swap from then on.",
    ],
  },
  {
    title: "What the kiln guarantees",
    body: [
      "Liquidity leaves a Uniswap v4 pool through exactly one door: a modifyLiquidity call with a negative delta. Kiln.sol does not contain one. There is no withdraw, no collect, no rescue, no owner and no upgrade path.",
      "A v4 position is not an NFT either. It is a row in the pool manager keyed by the address that added it, so there is nothing to transfer, sell, lend against or approve away by accident.",
      "That is the whole of the guarantee, and it is a negative: not a promise to leave the liquidity alone, but the absence of any function that could move it.",
    ],
  },
  {
    title: "What it deliberately does not guarantee",
    body: [
      "Part of every supply does not go into the pool. It is minted straight to the wallet the creator nominated, and it is liquid from the first block — not vested, not cliffed, not locked. No contract in this launchpad can restrain it.",
      "Whoever holds that wallet can sell into any bid that appears. The exact share is a constant in Clayspad.sol, the same for every launch, and it is worth reading before buying anything launched here.",
      "Clayspad also makes no claim about any token launched through it. It enforces what it enforces — the split, the lock, the fee — and nothing about whether a project is real.",
    ],
  },
  {
    title: "Why the fee cannot change",
    body: [
      "The rate lives in a Uniswap v4 hook, and a pool's hook is part of its key. That means it is fixed when the pool is opened: not governed, not timelocked, not subject to a future proposal. A different hook is a different pool.",
      "The pool's own LP fee is zero, so the hook's rate is the entire fee schedule — there is no second number to add to it.",
      "The fee is charged on the way in, in whichever currency the trader is paying with, and it is banked as a claim against the pool manager rather than taken as cash mid-swap. Taking cash at that point would revert on a pool that has no ETH in it yet, which every pool is until its first buy.",
    ],
  },
  {
    title: "Where the numbers are",
    body: [
      "The supply, the share fired into the pool, the share that stays liquid, the swap fee and the creator's cut are constants in Clayspad.sol and ClayHook.sol, with no setters.",
      "They are not restated on this site, in the bio or in any post. Anything restated can drift from the code it describes, gets screenshotted, and outlives the version it was true for.",
      "The shelf and each token's page show live figures — price, what is in the pool, what is left — read from the launchpad and the pool manager at the moment the page loads. Those are readings, not claims.",
    ],
  },
];

export default function LearnPage() {
  return (
    <div className="max-w-3xl space-y-12">
      <header>
        <h1 className="font-display text-3xl font-bold text-paper">How it works</h1>
        <p className="mt-2 text-sm leading-relaxed text-paper-faint">
          What a launch does, what the contracts guarantee, and what they deliberately do not.
        </p>
      </header>

      {SECTIONS.map((section) => (
        <section key={section.title}>
          <h2 className="font-display text-xl font-bold text-signal">{section.title}</h2>
          <div className="mt-4 space-y-4">
            {section.body.map((paragraph) => (
              <p key={paragraph.slice(0, 40)} className="text-sm leading-relaxed text-paper-dim">
                {paragraph}
              </p>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
