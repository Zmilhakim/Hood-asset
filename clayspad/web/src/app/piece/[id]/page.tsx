import type { Metadata } from "next";

import { PieceDetail } from "@/components/shelf/PieceDetail";
import { EmptyState } from "@/components/ui/EmptyState";

export const metadata: Metadata = { title: "A launch" };

export default async function PiecePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  if (!/^\d+$/.test(id)) {
    return (
      <EmptyState title="That is not a piece number">
        <p>Pieces are numbered from zero, in the order they were fired.</p>
      </EmptyState>
    );
  }

  return <PieceDetail id={BigInt(id)} />;
}
