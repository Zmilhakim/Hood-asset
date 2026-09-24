import type { Metadata } from "next";

import { LaunchForm } from "@/components/launch/LaunchForm";

export const metadata: Metadata = {
  title: "Launch a token",
  description: "Name it, price its range, and fire it. One transaction, and it costs nothing but gas.",
};

export default function LaunchPage() {
  return (
    <div className="max-w-3xl space-y-8">
      <header>
        <h1 className="font-display text-3xl font-bold text-paper">Launch a token</h1>
        <p className="mt-2 max-w-prose text-sm leading-relaxed text-paper-faint">
          One transaction. The supply is minted and split, the pool is opened, and the pool&apos;s share is fired into
          it. Everything below is what a launch decides; everything it does not ask you is fixed in the contract and the
          same for every token.
        </p>
      </header>

      <LaunchForm />
    </div>
  );
}
