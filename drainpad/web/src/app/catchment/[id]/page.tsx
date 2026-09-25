import type { Metadata } from "next";

import { RunoffDetail } from "@/components/RunoffDetail";

export const metadata: Metadata = { title: "Runoff" };

export default async function RunoffPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <RunoffDetail id={id} />;
}
