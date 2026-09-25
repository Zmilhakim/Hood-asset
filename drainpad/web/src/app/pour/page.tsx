import type { Metadata } from "next";

import { PourForm } from "@/components/PourForm";

export const metadata: Metadata = {
  title: "Pour",
  description: "Mint a token, open its pool and send the pool's share down — one transaction, nothing but gas.",
};

export default function PourPage() {
  return (
    <div className="py-12 md:py-16">
      <p className="stencil mb-4">The pour</p>
      <h1 className="max-w-2xl font-display text-4xl font-extrabold leading-[0.95] tracking-[-0.03em] text-chalk md:text-5xl">
        One transaction, and it cannot be undone
      </h1>
      <p className="mt-5 max-w-xl text-base leading-relaxed text-grit">
        There is no posting fee. What this costs is gas, and what it produces is a row in the launchpad that nothing
        takes back out.
      </p>

      <div className="mt-10">
        <PourForm />
      </div>
    </div>
  );
}
