import Link from "next/link";

import { Grate, Level } from "@/components/Section";
import { LatestRunoffs } from "@/components/LatestRunoffs";

export default function Home() {
  return (
    <>
      <section className="pt-14 pb-10 md:pt-20 md:pb-14">
        <p className="stencil mb-5">Robinhood Chain · Uniswap v4</p>
        <h1 className="max-w-3xl font-display text-[2.6rem] font-extrabold leading-[0.95] tracking-[-0.03em] text-chalk md:text-7xl">
          Water finds the lowest point <br className="hidden md:inline" />
          and stays there.
        </h1>
        <p className="mt-6 max-w-xl text-lg leading-relaxed text-grit">
          A launchpad where one transaction mints a token, opens its pool, and sends the pool&apos;s share down into a
          contract that has no function to pump any of it back out.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/pour"
            className="border border-paint bg-paint px-5 py-3 font-display text-sm font-bold uppercase tracking-[0.14em] text-asphalt-deep transition-opacity hover:opacity-90"
          >
            Pour a token
          </Link>
          <Link
            href="/how"
            className="border border-kerb px-5 py-3 font-display text-sm font-bold uppercase tracking-[0.14em] text-chalk transition-colors hover:border-kerb-bright"
          >
            Where it goes
          </Link>
        </div>
      </section>

      <Grate />

      <Level marker="Level 01 · The pour" title="One transaction, and it is already done">
        <div className="grid gap-4 md:grid-cols-3">
          {[
            {
              step: "01",
              title: "The supply is printed",
              body: "The token's constructor mints the whole of it and splits it in that same transaction. There is no mint function afterwards, no owner, no pause.",
            },
            {
              step: "02",
              title: "The pool opens",
              body: "Native ETH against the token, with the grate in its key. A pool's hook is part of its key, so what it charges on its first day is what it charges on its last.",
            },
            {
              step: "03",
              title: "The pool's share goes down",
              body: "Into the sump, as one position. Search that contract for a way to take it back out. There is not one.",
            },
          ].map((card) => (
            <div key={card.step} className="slab p-5">
              <div className="stencil mb-3">{card.step}</div>
              <h3 className="font-display text-base font-bold uppercase text-chalk">{card.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-grit">{card.body}</p>
            </div>
          ))}
        </div>
      </Level>

      <Grate />

      <Level marker="Level 02 · The grate" title="Nothing passes without crossing it">
        <div className="grid gap-6 md:grid-cols-[1.1fr_1fr]">
          <p className="text-base leading-relaxed text-grit">
            Every pool charges on the way in, in either direction. Buy with ETH and it is kept in ETH; sell the token
            back and it is kept in the token. What is kept is split between whoever launched the token and the
            treasury, and both sides of that split are constants with no setter.
            <br />
            <br />
            It is charged on the input rather than the output on purpose. Charging the output would pay a creator in
            the one asset they are least short of — the token they just launched.
          </p>
          <div className="slab p-5">
            <div className="stencil mb-3">Read it at the source</div>
            <p className="text-sm leading-relaxed text-grit">
              The rate and the split are in the grate&apos;s verified source, where they are constants anyone can check.
              They are not repeated here, because a second copy of a number is a copy that can go stale, be mistyped,
              or read as a promise.
            </p>
            <Link href="/how" className="stencil mt-4 inline-block transition-colors hover:text-chalk">
              How the whole thing works →
            </Link>
          </div>
        </div>
      </Level>

      <Grate />

      <Level marker="Level 03 · The catchment" title="What has been poured">
        <LatestRunoffs limit={6} />
      </Level>
    </>
  );
}
