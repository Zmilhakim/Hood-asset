import type { Metadata } from "next";

import { CatchmentFeed } from "@/components/CatchmentFeed";

export const metadata: Metadata = {
  title: "Catchment",
  description: "Every token poured through Drainpad, newest first, read straight off the launchpad.",
};

export default function CatchmentPage() {
  return (
    <div className="py-12 md:py-16">
      <p className="stencil mb-4">The catchment</p>
      <h1 className="max-w-2xl font-display text-4xl font-extrabold leading-[0.95] tracking-[-0.03em] text-chalk md:text-5xl">
        Everything that has run down here
      </h1>
      <p className="mt-5 max-w-xl text-base leading-relaxed text-grit">
        Read off the launchpad itself, newest first. A launch is a row in that contract from the block it happens in,
        and nothing takes a row back out.
      </p>

      <div className="mt-10">
        <CatchmentFeed />
      </div>
    </div>
  );
}
