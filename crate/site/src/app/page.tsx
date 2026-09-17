import { Connect } from "@/components/Connect";
import { Manifest, NotLaunched, Price } from "@/components/Manifest";
import { Swap } from "@/components/Swap";
import { Panel } from "@/components/ui/Panel";
import { LAUNCHED, TICKER } from "@/lib/addresses";
import { X_HANDLE, X_URL } from "@/lib/site";

export default function Home() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-5xl flex-col px-4 sm:px-6">
      <header className="flex items-center justify-between py-6">
        <div className="flex items-center gap-3">
          <span className="h-3 w-3 rounded-full seal-dot" aria-hidden />
          <span className="stencil text-lg tracking-[0.2em]">{TICKER}</span>
        </div>
        <Connect />
      </header>

      <main className="flex-1 pb-16">
        <section className="py-10 sm:py-14">
          <h1 className="stencil text-4xl leading-[1.05] sm:text-6xl">
            One crate on
            <br />
            Robinhood Chain
          </h1>
          <p className="mt-5 max-w-xl text-base text-ink-soft sm:text-lg">
            Packed once, sealed once. The whole supply opened a single Uniswap v4 pool against native ETH, and the
            liquidity that came out of it can never be taken back — not by anyone, including whoever packed it.
          </p>
        </section>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
          <div className="order-last space-y-5 lg:order-none">
            {LAUNCHED && <Price />}
            <Manifest />

            <Panel>
              <h2 className="stencil mb-3 text-sm">What the seal actually means</h2>
              <div className="space-y-3 text-sm text-ink-soft">
                <p>
                  <span className="text-ink">The liquidity cannot come out.</span> In Uniswap v4 a position is not an
                  NFT — it is a row in the pool manager belonging to the contract that added it. That contract has no
                  function that removes liquidity. Every liquidity change in it is zero or positive, so there is
                  nothing to transfer, sell, borrow against or approve away.
                </p>
                <p>
                  <span className="text-ink">The supply is fixed.</span> A billion {TICKER}, minted once, straight into
                  the pool. No mint function, no owner, no pause, and nothing held back for a team.
                </p>
                <p>
                  <span className="text-ink">Trading fees go to one address,</span> fixed when the seal was deployed,
                  with no function anywhere that changes it. That is the project&rsquo;s only income — the money people
                  pay for supply stays in the pool, permanently.
                </p>
              </div>
            </Panel>

            <Panel>
              <h2 className="stencil mb-3 text-sm">What this does not promise</h2>
              <p className="text-sm text-ink-soft">
                Locked liquidity is not a floor, and none of this makes {TICKER} worth anything. The price is whatever
                people pay. The contracts are not audited. Buy what you are willing to watch go to zero.
              </p>
            </Panel>
          </div>

          {/* First on a phone: somebody who came here to buy should not have to
              scroll past three panels of explanation to find the button. */}
          <div className="order-first lg:order-none lg:sticky lg:top-6 lg:self-start">
            {LAUNCHED ? <Swap /> : <NotLaunched />}
          </div>
        </div>
      </main>

      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--line)] py-6 text-xs text-ink-soft">
        <span className="stencil">{TICKER} · Robinhood Chain</span>
        <a href={X_URL} target="_blank" rel="noreferrer" className="underline underline-offset-2">
          {X_HANDLE} ↗
        </a>
      </footer>
    </div>
  );
}
