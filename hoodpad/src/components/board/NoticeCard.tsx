import { NoticeImage } from "./NoticeImage";
import { Badge } from "@/components/ui/Badge";
import { explorerAddress } from "@/lib/chain";
import type { Notice } from "@/lib/contracts";
import { formatTokenAmount, shortAddress, timeAgo } from "@/lib/format";

export function NoticeCard({ notice }: { notice: Notice }) {
  const posted = timeAgo(notice.postedAt);
  const supply = formatTokenAmount(notice.supply);

  return (
    <article className="flex gap-4 border-2 border-ink bg-paper p-3 sm:p-4">
      <NoticeImage src={notice.imageURI} symbol={notice.symbol} className="size-16 shrink-0 sm:size-20" />

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <h3 className="font-display truncate text-lg leading-tight">{notice.name}</h3>
          <span className="micro font-semibold text-flame-deep">${notice.symbol}</span>
          <span className="ml-auto">
            <Badge tone="flame">Locked</Badge>
          </span>
        </div>

        {notice.blurb && <p className="mt-1.5 line-clamp-2 text-sm text-ink-soft">{notice.blurb}</p>}

        <dl className="micro mt-3 flex flex-wrap gap-x-5 gap-y-1 text-ink-faint">
          {supply && (
            <div className="flex gap-1.5">
              <dt>Supply</dt>
              <dd className="text-ink-soft">{supply}</dd>
            </div>
          )}
          <div className="flex gap-1.5">
            <dt>Posted by</dt>
            <dd className="text-ink-soft">{shortAddress(notice.poster)}</dd>
          </div>
          {posted && (
            <div className="flex gap-1.5">
              <dt>When</dt>
              <dd className="text-ink-soft">{posted}</dd>
            </div>
          )}
          <div className="flex gap-1.5">
            <dt>Pool</dt>
            <dd className="text-ink-soft">locked forever</dd>
          </div>
        </dl>

        <div className="micro mt-3 flex flex-wrap gap-x-4 gap-y-1">
          <a
            href={explorerAddress(notice.token)}
            target="_blank"
            rel="noreferrer noopener"
            className="font-semibold text-ink underline decoration-flame decoration-2 underline-offset-2 hover:text-flame-deep"
          >
            Token contract ↗
          </a>
          {notice.link && (
            <a
              href={notice.link}
              target="_blank"
              rel="noreferrer noopener nofollow"
              className="text-ink-soft underline underline-offset-2 hover:text-flame-deep"
            >
              Links ↗
            </a>
          )}
        </div>
      </div>
    </article>
  );
}
