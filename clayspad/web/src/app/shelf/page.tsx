import type { Metadata } from "next";

import { ShelfFeed } from "@/components/shelf/ShelfFeed";
import { ShelfStats } from "@/components/shelf/ShelfStats";

export const metadata: Metadata = {
  title: "The shelf",
  description: "Every token launched through Clayspad, newest first, read from the chain.",
};

export default function ShelfPage() {
  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-display text-3xl font-bold text-paper">The shelf</h1>
        <p className="mt-2 max-w-prose text-sm leading-relaxed text-paper-faint">
          Every token launched through Clayspad, newest first. Everything on this page is read from the launchpad and
          the pool manager at the moment you load it — nothing is cached, and nothing is estimated.
        </p>
      </header>

      <ShelfStats />
      <ShelfFeed />
    </div>
  );
}
