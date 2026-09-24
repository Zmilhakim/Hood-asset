import { ButtonLink } from "@/components/ui/Button";
import { Mark } from "@/components/brand/Mark";
import { robinhoodChain } from "@/lib/chain";

/**
 * The landing page.
 *
 * Deliberately without a single figure on it. The supply split, the swap fee
 * and the range are constants in the contracts and that is where they are
 * published; this page says what the launchpad does and sends anyone who wants
 * the numbers to the thing that enforces them.
 */

const STEPS = [
  {
    title: "Post it",
    body: "Name, ticker, a line about what it is, and the wallet the liquid share goes to. One transaction, and it costs nothing but gas.",
  },
  {
    title: "It fires",
    body: "The supply is minted and split in the token's own constructor. Most of it goes straight into a Uniswap v4 pool against ETH, as a single position held by a contract with no function that gives any back.",
  },
  {
    title: "It pays",
    body: "Every swap after that pays a fee, in whichever currency the trader paid in. Most of it is yours, claimable whenever you want it, for as long as anyone trades the token.",
  },
];

const FAQ = [
  {
    q: "What does “the kiln has no door” actually mean?",
    a: "The pool's share of the supply goes into a contract called Kiln, and that contract has no withdraw, no collect, no rescue and no owner. Liquidity leaves a Uniswap v4 pool through exactly one door — a modifyLiquidity call with a negative delta — and the file does not contain one. It is not a promise anyone has to keep; it is a function that was never written.",
  },
  {
    q: "Does all of the supply go into the pool?",
    a: "No, and it is worth being precise about that. Most of it does. The rest is minted straight to a wallet the creator nominates, and it is liquid from the first block — not vested, not cliffed, not locked. No contract here can restrain it. The exact share is a constant in Clayspad.sol; read it there before you buy anything.",
  },
  {
    q: "Can the fee be changed after a launch?",
    a: "No. The rate lives in a Uniswap v4 hook, and a pool's hook is part of its key — so it is fixed when the pool is opened. Not governed, not timelocked, not “no plans to change it”. A different hook is a different pool.",
  },
  {
    q: "Why are there no numbers on this page?",
    a: "Because they are in the contracts, and the contracts are the specification. Anything restated in marketing can drift from the code it describes, gets screenshotted, and outlives the version it was true for. The shelf and each token's page show live figures read straight off the chain; this page makes no claims of its own.",
  },
  {
    q: "What can I sell on the first day?",
    a: "A pool nobody has bought from holds no ETH — the whole position is still token. That is why the first buy fills immediately, and why nothing can be sold back into it until somebody has bought first. It is not a launch mechanic, it is what a one-sided pool is.",
  },
];

export default function Home() {
  return (
    <div className="space-y-20">
      <section className="pt-6 sm:pt-10">
        <div className="flex items-center gap-3">
          <Mark size={34} className="text-clay-light" />
          <span className="micro font-semibold text-signal">Launching on {robinhoodChain.name}</span>
        </div>

        <h1 className="mt-6 max-w-3xl font-display text-4xl font-bold leading-[1.1] text-paper sm:text-6xl">
          The kiln has no door.
        </h1>

        <p className="mt-6 max-w-2xl text-base leading-relaxed text-paper-dim sm:text-lg">
          Clay can be worked, wetted and thrown again right up until it goes in the kiln. Once it comes out it is
          ceramic, and there is no process that turns it back. Clayspad launches a token the same way: one transaction,
          and the part that goes into the pool does not come out again.
        </p>

        <div className="mt-9 flex flex-wrap gap-3">
          <ButtonLink tone="signal" href="/shelf">
            See the shelf
          </ButtonLink>
          <ButtonLink tone="quiet" href="/launch">
            Launch a token
          </ButtonLink>
          <ButtonLink tone="ghost" href="/learn">
            How it works
          </ButtonLink>
        </div>
      </section>

      <section>
        <h2 className="micro font-semibold text-paper-faint">What a launch does</h2>
        <div className="mt-5 grid gap-4 lg:grid-cols-3">
          {STEPS.map((step, index) => (
            <div key={step.title} className="clay-panel rounded-sm px-5 py-5">
              <div className="micro text-signal">{String(index + 1).padStart(2, "0")}</div>
              <h3 className="mt-2 font-display text-lg font-bold text-paper">{step.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-paper-faint">{step.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="micro font-semibold text-paper-faint">Straight answers</h2>
        <dl className="mt-5 divide-y divide-clay-dark border-y border-clay-dark">
          {FAQ.map((item) => (
            <div key={item.q} className="grid gap-2 py-5 lg:grid-cols-[minmax(0,22rem)_1fr] lg:gap-10">
              <dt className="font-display font-bold text-paper">{item.q}</dt>
              <dd className="max-w-prose text-sm leading-relaxed text-paper-faint">{item.a}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}
