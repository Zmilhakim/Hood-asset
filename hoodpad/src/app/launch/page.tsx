import type { Metadata } from "next";
import { LaunchForm } from "@/components/launch/LaunchForm";

export const metadata: Metadata = {
  title: "Launch",
  description: "Mint the supply, open a single-sided pool and lock it — in one transaction.",
};

export default function LaunchPage() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-3xl leading-tight sm:text-4xl">Post a notice</h1>
        <p className="mt-2 max-w-prose text-sm leading-6 text-paper/70">
          One transaction mints the supply, opens the pool with all of it and locks the position for good. Read what
          it will write before you sign it.
        </p>
      </div>
      <LaunchForm />
    </div>
  );
}
