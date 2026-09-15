"use client";

import { useState } from "react";
import Link from "next/link";
import { NoticeCard } from "./NoticeCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { Panel } from "@/components/ui/Panel";
import { Tabs } from "@/components/ui/Tabs";
import { buttonClasses } from "@/components/ui/Button";
import { useLatestNotices } from "@/lib/board";
import { BOARD_IS_OPEN } from "@/lib/contracts";

type Section = "tokens" | "drops";

export function BoardFeed() {
  const [section, setSection] = useState<Section>("tokens");
  const { notices, isLoading, isError } = useLatestNotices(40);

  const wanted = section === "tokens" ? 0 : 1;
  const rows = notices?.filter((notice) => Number(notice.kind) === wanted) ?? [];

  return (
    <div>
      <Tabs
        tabs={[
          { key: "tokens", label: "Tokens", count: notices ? notices.filter((n) => Number(n.kind) === 0).length : null },
          { key: "drops", label: "Drops", count: notices ? notices.filter((n) => Number(n.kind) === 1).length : null },
        ]}
        active={section}
        onChange={(key) => setSection(key as Section)}
      />

      <Panel bodyClassName="p-3 sm:p-4">
        {!BOARD_IS_OPEN ? (
          <EmptyState title="The board opens soon">
            Hoodpad is not live on Robinhood Chain yet. The first notice lands here the moment a token launches — and
            it will be read from the chain, not typed in.
          </EmptyState>
        ) : isLoading ? (
          <ul className="space-y-3" aria-busy>
            {[0, 1, 2].map((row) => (
              <li key={row} className="h-28 animate-pulse border-2 border-ink/20 bg-paper-dim/60" />
            ))}
          </ul>
        ) : isError ? (
          <EmptyState title="The board is out of reach">
            The RPC endpoint did not answer. Nothing is shown here rather than something stale — reload once the
            connection is back.
          </EmptyState>
        ) : rows.length === 0 ? (
          <EmptyState title={section === "tokens" ? "No tokens posted yet" : "No drops posted yet"}>
            Nothing has been nailed up in this section.{" "}
            <Link href="/launch" className="underline decoration-flame decoration-2 underline-offset-2">
              Post the first one
            </Link>
            .
          </EmptyState>
        ) : (
          <ul className="space-y-3">
            {rows.map((notice) => (
              <li key={notice.id.toString()}>
                <NoticeCard notice={notice} />
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {BOARD_IS_OPEN && rows.length > 0 && (
        <div className="mt-4 flex justify-center">
          <Link href="/launch" className={buttonClasses("quiet")}>
            Post a notice
          </Link>
        </div>
      )}
    </div>
  );
}
