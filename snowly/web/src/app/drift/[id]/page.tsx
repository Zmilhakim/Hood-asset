import type { Metadata } from "next";

import { DriftDetail } from "@/components/drift/DriftDetail";

export const metadata: Metadata = { title: "Drift" };

export default async function DriftPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // A route parameter is whatever was typed into the address bar. Anything that
  // is not a plain number is not a drift, and should say so rather than throwing.
  if (!/^\d+$/.test(id)) {
    return <p className="text-sm text-crevasse">“{id}” is not a drift number.</p>;
  }

  return <DriftDetail id={BigInt(id)} />;
}
