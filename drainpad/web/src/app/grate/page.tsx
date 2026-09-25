import type { Metadata } from "next";

import { GratePanel } from "@/components/GratePanel";

export const metadata: Metadata = {
  title: "Grate",
  description: "What the grate has kept for you, and the one transaction that takes it.",
};

export default function GratePage() {
  return (
    <div className="py-12 md:py-16">
      <p className="stencil mb-4">The grate</p>
      <h1 className="max-w-2xl font-display text-4xl font-extrabold leading-[0.95] tracking-[-0.03em] text-chalk md:text-5xl">
        What it caught on your behalf
      </h1>
      <p className="mt-5 max-w-xl text-base leading-relaxed text-grit">
        Held as a claim against the pool manager until you redeem it. It pays the address that asks and nobody else —
        there is no recipient argument anywhere in that contract.
      </p>

      <div className="mt-10">
        <GratePanel />
      </div>
    </div>
  );
}
