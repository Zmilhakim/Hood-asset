import type { Metadata } from "next";
import { MyNotices } from "@/components/dashboard/MyNotices";

export const metadata: Metadata = {
  title: "Dashboard",
  description: "The notices you posted, and the fees your locked positions have earned.",
};

export default function DashboardPage() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-3xl leading-tight sm:text-4xl">Your side of the board</h1>
        <p className="mt-2 max-w-prose text-sm leading-6 text-paper/70">
          Everything you have posted, read back from the chain. The liquidity itself is gone for good — the trading
          fees it earns are not.
        </p>
      </div>
      <MyNotices />
    </div>
  );
}
