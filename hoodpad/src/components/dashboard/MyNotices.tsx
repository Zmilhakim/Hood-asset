"use client";

import Link from "next/link";
import { useConnection, useReadContract, useWaitForTransactionReceipt, useWriteContract } from "wagmi";

import { NoticeCard } from "@/components/board/NoticeCard";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Panel } from "@/components/ui/Panel";
import { useNoticesOf } from "@/lib/board";
import { ROBINHOOD_CHAIN_ID } from "@/lib/chain";
import { BOARD_IS_OPEN, FACTORY_ADDRESS, hoodpadFactoryAbi, positionLockerAbi, type Notice } from "@/lib/contracts";

function CollectFees({ notice, locker }: { notice: Notice; locker?: `0x${string}` }) {
  const { writeContract, data: hash, isPending } = useWriteContract();
  const receipt = useWaitForTransactionReceipt({ hash });

  if (notice.kind !== 0 || notice.positionId === 0n || !locker) return null;

  return (
    <div className="flex flex-wrap items-center gap-3 border-t-2 border-dashed border-ink/20 px-3 py-2.5 sm:px-4">
      <Button
        tone="quiet"
        disabled={isPending || receipt.isLoading}
        onClick={() =>
          writeContract({
            address: locker,
            abi: positionLockerAbi,
            functionName: "collectFees",
            chainId: ROBINHOOD_CHAIN_ID,
            args: [notice.positionId],
          })
        }
      >
        {isPending ? "Confirm in wallet…" : receipt.isLoading ? "Collecting…" : "Collect trading fees"}
      </Button>
      <span className="micro text-ink-faint">
        {receipt.isSuccess ? "Fees sent to you." : "Position #" + notice.positionId.toString() + " — locked forever"}
      </span>
    </div>
  );
}

export function MyNotices() {
  const { address, isConnected } = useConnection();
  const { notices, isLoading } = useNoticesOf(address);

  const { data: locker } = useReadContract({
    address: FACTORY_ADDRESS,
    abi: hoodpadFactoryAbi,
    chainId: ROBINHOOD_CHAIN_ID,
    functionName: "locker",
    query: { enabled: BOARD_IS_OPEN },
  });

  if (!BOARD_IS_OPEN) {
    return (
      <Panel label="Your notices">
        <EmptyState title="Nothing to show yet">
          Hoodpad is not deployed on Robinhood Chain, so there is no board to read your notices from.
        </EmptyState>
      </Panel>
    );
  }

  if (!isConnected) {
    return (
      <Panel label="Your notices">
        <EmptyState title="Connect to see your notices">
          This page reads the board for the address you connect with. Nothing is stored here.
        </EmptyState>
      </Panel>
    );
  }

  return (
    <Panel
      label="Your notices"
      aside={<Badge tone="live">{notices ? `${notices.length} posted` : "reading"}</Badge>}
      bodyClassName="p-3 sm:p-4"
    >
      {isLoading ? (
        <ul className="space-y-3" aria-busy>
          {[0, 1].map((row) => (
            <li key={row} className="h-28 animate-pulse border-2 border-ink/20 bg-paper-dim/60" />
          ))}
        </ul>
      ) : !notices || notices.length === 0 ? (
        <EmptyState title="You have not posted anything">
          When you launch through Hoodpad the notice shows up here, along with the fees your locked position has
          earned.{" "}
          <Link href="/launch" className="underline decoration-flame decoration-2 underline-offset-2">
            Post your first
          </Link>
          .
        </EmptyState>
      ) : (
        <ul className="space-y-3">
          {notices.map((notice) => (
            <li key={notice.id.toString()} className="border-2 border-ink bg-paper">
              <NoticeCard notice={notice} />
              <CollectFees notice={notice} locker={locker as `0x${string}` | undefined} />
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
