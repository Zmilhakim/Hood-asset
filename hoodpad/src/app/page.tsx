import Link from "next/link";

import { Faq } from "@/components/landing/Faq";
import { Family } from "@/components/landing/Family";
import { Hero } from "@/components/landing/Hero";
import { Steps } from "@/components/landing/Steps";
import { TickerNotice } from "@/components/landing/TickerNotice";
import { buttonClasses } from "@/components/ui/Button";

export default function LandingPage() {
  return (
    <div className="space-y-12 sm:space-y-14">
      <Hero />
      <Steps />
      <TickerNotice />
      <Family />
      <Faq />

      <section className="border-t-2 border-dashed border-paper/20 pt-10 text-center">
        <h2 className="font-display text-2xl text-paper sm:text-3xl">Nail something up</h2>
        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-paper/70">
          The form tells you exactly what it will write to the chain before you sign it.
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-2.5">
          <Link href="/launch" className={buttonClasses("flame")}>
            Post a notice
          </Link>
          <Link href="/learn" className={buttonClasses("quiet")}>
            Read the rules first
          </Link>
        </div>
      </section>
    </div>
  );
}
