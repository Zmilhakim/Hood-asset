import type { Metadata } from "next";

import { FeePanel } from "@/components/fees/FeePanel";
import { Panel } from "@/components/ui/Panel";

export const metadata: Metadata = {
  title: "Your fees",
  description: "What the hook owes you, and the button that takes it.",
};

export default function FeesPage() {
  return (
    <div className="space-y-8">
      <header className="max-w-2xl">
        <h1 className="text-2xl md:text-3xl">Your fees</h1>
        <p className="mt-3 text-[0.9375rem] leading-relaxed text-stone-soft">
          Every swap in a Snowly pool pays a fee on what goes into it, and the creator’s share of that is
          banked as a claim against the pool manager — redeemed when you withdraw. The rate and the split are
          constants in the hook.
        </p>
      </header>

      <FeePanel />

      <Panel accent className="px-5 py-5">
        <h2 className="text-base">Why it is banked rather than paid out mid-swap</h2>
        <p className="mt-2 text-sm leading-relaxed text-stone-soft">
          Taking real ETH out of the pool manager during a swap would revert on a pool that has none yet — which
          is every pool until its first buy, and that would make a fresh launch unbuyable. So the hook mints an
          ERC-6909 claim instead and redeems it here, in a transaction of its own.
        </p>
        <p className="mt-3 text-sm leading-relaxed text-stone-soft">
          Sells pay their fee in the token rather than ETH. Withdrawing those needs the token’s own address, and
          the contract takes several at once — `withdrawMany` on the hook.
        </p>
      </Panel>
    </div>
  );
}
