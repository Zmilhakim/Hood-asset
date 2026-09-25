import type { Metadata } from "next";

import { DriftList } from "@/components/snowfield/DriftList";
import { FieldSummary } from "@/components/snowfield/FieldSummary";

export const metadata: Metadata = {
  title: "Snowfield",
  description: "Every token launched through Snowly, newest first, read straight off the chain.",
};

export default function SnowfieldPage() {
  return (
    <div className="space-y-8">
      <header className="max-w-2xl">
        <h1 className="text-2xl md:text-3xl">The snowfield</h1>
        <p className="mt-3 text-[0.9375rem] leading-relaxed text-stone-soft">
          Every launch, newest first. The split and the fee are the same for all of them by construction, so the
          only things that differ down this list are the name, who launched it, and when.
        </p>
      </header>

      <FieldSummary />
      <DriftList />
    </div>
  );
}
