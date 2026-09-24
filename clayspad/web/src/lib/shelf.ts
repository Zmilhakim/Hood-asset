"use client";

import { useReadContract } from "wagmi";

import { CLAYSPAD_ADDRESS, SHELF_IS_OPEN, clayspadAbi, type Piece, type ShelfStats } from "./contracts";

/**
 * Reads of the launchpad, in one place.
 *
 * Every hook here is disabled while there is no address. That is what makes the
 * empty state honest: nothing is fetched, nothing is pending, and a page can say
 * "there is nothing on the shelf" and mean it rather than meaning "this has not
 * loaded".
 */
const base = { address: CLAYSPAD_ADDRESS, abi: clayspadAbi } as const;

export function useShelfStats() {
  const query = useReadContract({
    ...base,
    functionName: "shelfStats",
    query: { enabled: SHELF_IS_OPEN },
  });

  const raw = query.data;
  const stats: ShelfStats | null = raw
    ? {
        tokens: raw[0],
        lastLaunch: raw[1],
        supply: raw[2],
        poolBps: raw[3],
        supplyWalletBps: raw[4],
        feeBps: raw[5],
        creatorBps: raw[6],
      }
    : null;

  return { ...query, stats };
}

export function useLatestPieces(limit = 24, offset = 0) {
  const query = useReadContract({
    ...base,
    functionName: "latest",
    args: [BigInt(offset), BigInt(limit)],
    query: { enabled: SHELF_IS_OPEN },
  });

  return { ...query, pieces: (query.data as readonly Piece[] | undefined) ?? null };
}

export function usePiece(id: bigint | null) {
  const query = useReadContract({
    ...base,
    functionName: "pieceAt",
    args: id === null ? undefined : [id],
    query: { enabled: SHELF_IS_OPEN && id !== null },
  });

  return { ...query, piece: (query.data as Piece | undefined) ?? null };
}

export function usePiecesOf(owner: `0x${string}` | undefined) {
  const query = useReadContract({
    ...base,
    functionName: "piecesOf",
    args: owner ? [owner] : undefined,
    query: { enabled: SHELF_IS_OPEN && Boolean(owner) },
  });

  return { ...query, ids: (query.data as readonly bigint[] | undefined) ?? null };
}
