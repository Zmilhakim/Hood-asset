import type { Metadata } from "next";

import { LaunchForm } from "@/components/launch/LaunchForm";

export const metadata: Metadata = {
  title: "Launch",
  description: "Launch a token on Snowly: one transaction, and the pool's share is buried for good.",
};

export default function LaunchPage() {
  return (
    <div className="space-y-8">
      <header className="max-w-2xl">
        <h1 className="text-2xl md:text-3xl">Launch a token</h1>
        <p className="mt-3 text-[0.9375rem] leading-relaxed text-stone-soft">
          One transaction, and it costs nothing but gas. The supply, the split and the fee are fixed in the
          contract rather than chosen here — what you decide is the name, the ticker, where the liquid share
          goes, and the range the pool opens across.
        </p>
      </header>

      <LaunchForm />
    </div>
  );
}
