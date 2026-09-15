import Image from "next/image";
import { HOOD_FAMILY } from "@/lib/brand";

export function Family() {
  return (
    <section>
      <h2 className="font-display text-2xl text-paper sm:text-3xl">The hoods it was built for</h2>
      <p className="mt-2 max-w-prose text-sm leading-6 text-paper/70">
        Hoodpad came out of launching these. Anyone can post a notice — the family just got there first.
      </p>

      <ul className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {HOOD_FAMILY.map((member) => (
          <li key={member.slug} className="paper-grain pin-shadow border-2 border-ink bg-paper">
            <Image
              src={`/hood/${member.slug}.webp`}
              alt={member.name}
              width={480}
              height={480}
              className="aspect-square w-full border-b-2 border-ink object-cover"
              sizes="(max-width: 1024px) 45vw, 22vw"
            />
            <div className="px-3 py-2.5">
              <h3 className="font-display text-base leading-tight text-ink">{member.name}</h3>
              <p className="micro mt-0.5 text-ink-faint">{member.note}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
