import Link from "next/link";

import type { Runoff } from "@/lib/catchment";
import { safeText, safeUrl, tokenHue } from "@/lib/catchment";
import { shortAddress, shortDate } from "@/lib/site";

export function RunoffCard({ runoff }: { runoff: Runoff }) {
  const name = safeText(runoff.name, 48) || "Unnamed";
  const symbol = safeText(runoff.symbol, 16);
  const blurb = safeText(runoff.blurb, 180);
  const image = safeUrl(runoff.imageURI);
  const hue = tokenHue(runoff.token);

  return (
    <Link
      href={`/catchment/${runoff.id}`}
      className="group slab flex gap-4 p-4 transition-colors hover:border-kerb-bright"
    >
      <div
        className="h-14 w-14 shrink-0 overflow-hidden border border-kerb"
        style={{ backgroundColor: `hsl(${hue} 22% 16%)` }}
      >
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={image} alt="" className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <div className="h-full w-full grate-bars opacity-50" />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="font-display text-base font-bold uppercase text-chalk group-hover:text-paint">{name}</span>
          {symbol ? <span className="figure text-xs text-grit">${symbol}</span> : null}
        </div>
        {blurb ? <p className="mt-1 line-clamp-2 text-sm leading-snug text-grit">{blurb}</p> : null}
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="figure text-xs text-grit-dim">{shortAddress(runoff.token, 8, 6)}</span>
          <span className="text-xs text-grit-dim">{shortDate(runoff.launchedAt)}</span>
        </div>
      </div>
    </Link>
  );
}
