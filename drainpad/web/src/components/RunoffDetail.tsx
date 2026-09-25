"use client";

import Link from "next/link";
import { useReadContract } from "wagmi";

import { Address } from "@/components/Address";
import { drainpadAbi } from "@/lib/abi/drainpad";
import { explorerCode } from "@/lib/chain";
import type { Runoff } from "@/lib/catchment";
import { safeText, safeUrl, tokenHue } from "@/lib/catchment";
import { DRAINPAD } from "@/lib/contracts";
import { shortDate } from "@/lib/site";

export function RunoffDetail({ id }: { id: string }) {
  const valid = /^\d+$/.test(id);

  const { data, isLoading, isError } = useReadContract({
    address: DRAINPAD,
    abi: drainpadAbi,
    functionName: "runoffAt",
    args: valid ? [BigInt(id)] : undefined,
    query: { enabled: valid },
  });

  if (!valid) return <Missing what="That is not a runoff number." />;
  if (isLoading) return <div className="slab my-16 h-72 animate-pulse opacity-60" />;
  if (isError || !data) return <Missing what="No runoff with that number has been poured." />;

  const runoff = data as unknown as Runoff;
  const name = safeText(runoff.name, 64) || "Unnamed";
  const symbol = safeText(runoff.symbol, 16);
  const blurb = safeText(runoff.blurb, 400);
  const image = safeUrl(runoff.imageURI);
  const link = safeUrl(runoff.link);
  const hue = tokenHue(runoff.token);

  return (
    <div className="py-12 md:py-16">
      <Link href="/catchment" className="stencil-dim transition-colors hover:text-paint">
        ← Catchment
      </Link>

      <div className="mt-6 flex flex-wrap items-start gap-5">
        <div
          className="h-24 w-24 shrink-0 overflow-hidden border border-kerb"
          style={{ backgroundColor: `hsl(${hue} 22% 16%)` }}
        >
          {image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={image} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="h-full w-full grate-bars opacity-50" />
          )}
        </div>

        <div className="min-w-0">
          <h1 className="font-display text-4xl font-extrabold leading-none tracking-[-0.03em] text-chalk md:text-5xl">
            {name}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
            {symbol ? <span className="figure text-sm text-paint">${symbol}</span> : null}
            <span className="text-sm text-grit-dim">Runoff #{runoff.id.toString()}</span>
            <span className="text-sm text-grit-dim">{shortDate(runoff.launchedAt)}</span>
          </div>
        </div>
      </div>

      {blurb ? <p className="mt-6 max-w-2xl text-base leading-relaxed text-grit">{blurb}</p> : null}

      {link ? (
        <a
          href={link}
          target="_blank"
          rel="noreferrer nofollow ugc"
          className="stencil mt-4 inline-block transition-colors hover:text-chalk"
        >
          {new URL(link).hostname} →
        </a>
      ) : null}

      <div className="mt-10 grid gap-4 md:grid-cols-2">
        <div className="slab p-5">
          <div className="stencil mb-4">The addresses</div>
          <div className="space-y-4">
            <Address label="Token" value={runoff.token} short />
            <Address label="Poured by" value={runoff.creator} short />
            <Address label="Supply wallet" value={runoff.supplyWallet} short />
          </div>
        </div>

        <div className="slab p-5">
          <div className="stencil mb-4">What holds here</div>
          <p className="text-sm leading-relaxed text-grit">
            The pool&apos;s share of this supply went into the sump and has no function that gives any of it back. The
            rest was minted to the supply wallet above and is liquid from the first block — not vested, not cliffed,
            not locked, and no contract here pretends otherwise.
          </p>
          <a
            href={explorerCode(runoff.token)}
            target="_blank"
            rel="noreferrer"
            className="stencil mt-4 inline-block transition-colors hover:text-chalk"
          >
            Read this token&apos;s source →
          </a>
        </div>
      </div>

      <p className="mt-6 max-w-2xl text-sm leading-relaxed text-grit-dim">
        The supply, the split and what the grate keeps are constants in the verified source. This page does not repeat
        them: a second copy of a figure is one more thing that can be wrong, and the contract cannot be.
      </p>
    </div>
  );
}

function Missing({ what }: { what: string }) {
  return (
    <div className="py-24">
      <p className="stencil mb-3">Nothing here</p>
      <h1 className="font-display text-3xl font-extrabold uppercase text-chalk">{what}</h1>
      <Link href="/catchment" className="stencil-dim mt-6 inline-block transition-colors hover:text-paint">
        ← Back to the catchment
      </Link>
    </div>
  );
}
