import type { Metadata } from "next";

import { Dashboard } from "@/components/dashboard/Dashboard";

export const metadata: Metadata = {
  title: "Dashboard",
  description: "What you launched, and the fees those launches have earned.",
};

export default function DashboardPage() {
  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-display text-3xl font-bold text-paper">Dashboard</h1>
        <p className="mt-2 max-w-prose text-sm leading-relaxed text-paper-faint">
          What this address launched, and what the fee on those pools has banked for it. The liquidity is not here and
          never will be — it is in the kiln, and there is no function that takes it out.
        </p>
      </header>

      <Dashboard />
    </div>
  );
}
