"use client";

import { PieceCard } from "@/components/shelf/PieceCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { SHELF_IS_OPEN } from "@/lib/contracts";
import { useLatestPieces } from "@/lib/shelf";

export function ShelfFeed() {
  const { pieces, isLoading, error } = useLatestPieces();

  if (!SHELF_IS_OPEN) {
    return (
      <EmptyState title="The shelf is empty because there is no shelf yet">
        <p>
          Clayspad is not deployed. Rather than fill this page with sample tokens, it shows you exactly what it can
          read, which right now is nothing.
        </p>
      </EmptyState>
    );
  }

  if (error) {
    return (
      <EmptyState title="The shelf could not be read">
        <p>
          The launchpad is deployed but this page could not reach it. That is a problem with the connection to the
          chain, not with the contract — reload, or point the app at another RPC.
        </p>
      </EmptyState>
    );
  }

  if (isLoading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true">
        {[0, 1, 2].map((key) => (
          <div key={key} className="clay-panel h-40 animate-pulse rounded-sm" />
        ))}
      </div>
    );
  }

  if (!pieces || pieces.length === 0) {
    return (
      <EmptyState title="Nothing has been fired yet">
        <p>The launchpad is live and no token has been launched through it. The first one goes here.</p>
      </EmptyState>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {pieces.map((piece) => (
        <PieceCard key={piece.id.toString()} piece={piece} />
      ))}
    </div>
  );
}
