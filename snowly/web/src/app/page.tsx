import Link from "next/link";

import { FieldSummary } from "@/components/snowfield/FieldSummary";
import { DriftList } from "@/components/snowfield/DriftList";
import { Panel } from "@/components/ui/Panel";
import { explorerAddress } from "@/lib/chain";
import { GLACIER, SNOWLY, SNOW_HOOK } from "@/lib/contracts";
import { shortAddress } from "@/lib/format";

export default function OverviewPage() {
  return (
    <div className="space-y-10">
      <header className="max-w-2xl">
        <h1 className="text-3xl leading-tight md:text-4xl">What the glacier takes, it keeps.</h1>
        <p className="mt-4 text-[0.9375rem] leading-relaxed text-stone-soft">
          Fresh snow is loose — it drifts, it packs down, the wind moves it somewhere else. Bury it deep enough
          and it stops being snow at all: the flakes fuse under their own weight into ice, and no thaw short of
          melting the whole glacier takes them apart again.
        </p>
        <p className="mt-3 text-[0.9375rem] leading-relaxed text-stone-soft">
          A launch here is one transaction. Everything about a token is loose right up until it, and one of the
          two things it does cannot be undone.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/launch"
            className="inline-flex items-center rounded-md bg-melt px-4 py-2 text-sm font-medium text-white transition hover:bg-melt-deep"
          >
            Launch a token
          </Link>
          <Link
            href="/how"
            className="inline-flex items-center rounded-md border border-rime bg-surface px-4 py-2 text-sm font-medium text-stone transition hover:border-melt hover:text-melt"
          >
            How it works
          </Link>
        </div>
      </header>

      <FieldSummary />

      <section className="grid gap-4 md:grid-cols-3">
        <Step
          n="1"
          title="The supply is split in the token’s own constructor"
          body="Minted once, and divided there and then between the glacier and a wallet the creator names. Both mints are in the launch receipt, so nobody has to be trusted about who got what."
        />
        <Step
          n="2"
          title="The pool opens against native ETH"
          body="The hook goes in the key, and the pool is priced at the top of the launch range — the point where the token is cheapest, so the first buy fills straight away."
        />
        <Step
          n="3"
          title="The glacier’s share goes in and stays"
          body="One position, added once. There is no withdraw in that contract, no owner, no pause and no upgrade path — search it for a negative liquidity delta and there is not one."
        />
      </section>

      <DriftList limit={10n} />

      <Panel className="px-5 py-5">
        <h2 className="text-base">The three addresses</h2>
        <p className="mt-2 text-sm leading-relaxed text-stone-soft">
          Verified, with the source published under MIT. The supply, the split and the fee are constants in
          there — read them at the source rather than taking a web page&apos;s word for it.
        </p>
        <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-3">
          <Address label="Launchpad" address={SNOWLY} />
          <Address label="Fee hook" address={SNOW_HOOK} />
          <Address label="Glacier" address={GLACIER} />
        </dl>
      </Panel>
    </div>
  );
}

function Step({ n, title, body }: { n: string; title: string; body: string }) {
  return (
    <Panel accent className="px-5 py-5">
      <p className="figure text-xs text-melt">{n}</p>
      <h3 className="mt-2 text-[0.9375rem] leading-snug">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-stone-soft">{body}</p>
    </Panel>
  );
}

function Address({ label, address }: { label: string; address: string }) {
  return (
    <div className="rounded-md bg-field-deep px-3 py-2.5">
      <dt className="label">{label}</dt>
      <dd className="figure mt-1">
        <a
          href={explorerAddress(address)}
          target="_blank"
          rel="noreferrer"
          className="text-stone-soft transition hover:text-melt"
        >
          {shortAddress(address)} ↗
        </a>
      </dd>
    </div>
  );
}
