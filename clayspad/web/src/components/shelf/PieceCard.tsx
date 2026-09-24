import Link from "next/link";

import { Badge } from "@/components/ui/Badge";
import { explorerAddress } from "@/lib/chain";
import { shortAddress, timeAgo } from "@/lib/format";
import type { Piece } from "@/lib/contracts";

/**
 * One launch on the shelf.
 *
 * No figure here is written into this file. The name, the ticker and the blurb
 * are whatever the creator posted; everything numeric is on the piece's own
 * page, where it is read from the pool rather than from a cache.
 */
export function PieceCard({ piece }: { piece: Piece }) {
  const launched = timeAgo(piece.launchedAt);

  return (
    <article className="clay-panel group rounded-sm transition-colors hover:border-clay">
      <Link href={`/piece/${piece.id}`} className="block px-5 py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate font-display text-lg font-bold text-paper group-hover:text-signal">
              {piece.name}
            </h3>
            <p className="micro mt-0.5 text-signal">${piece.symbol}</p>
          </div>
          <Badge tone="clay">#{piece.id.toString()}</Badge>
        </div>

        {piece.blurb ? (
          <p className="mt-3 line-clamp-2 text-sm leading-relaxed text-paper-faint">{piece.blurb}</p>
        ) : null}

        <dl className="mt-4 flex flex-wrap gap-x-5 gap-y-1 text-xs text-paper-faint">
          <div className="flex gap-1.5">
            <dt className="text-clay">Fired</dt>
            <dd className="tabular-nums">{launched ?? "—"}</dd>
          </div>
          <div className="flex gap-1.5">
            <dt className="text-clay">By</dt>
            <dd className="tabular-nums">{shortAddress(piece.creator) ?? "—"}</dd>
          </div>
        </dl>
      </Link>

      <div className="border-t border-clay-dark px-5 py-2.5">
        <a
          href={explorerAddress(piece.token)}
          target="_blank"
          rel="noreferrer"
          className="micro text-clay transition-colors hover:text-signal"
        >
          {shortAddress(piece.token)} ↗
        </a>
      </div>
    </article>
  );
}
