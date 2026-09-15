import { Panel } from "@/components/ui/Panel";

const STEPS = [
  {
    step: "01",
    title: "Mint",
    body: "One billion tokens, all at once. No mint function afterwards, no owner, no pause.",
  },
  {
    step: "02",
    title: "Open",
    body: "Every one of them goes into a single-sided pool. No ETH of yours is needed, and none is taken.",
  },
  {
    step: "03",
    title: "Lock",
    body: "The position goes somewhere it cannot come back from. The fees it earns still reach you.",
  },
] as const;

export function Steps() {
  return (
    <section>
      <h2 className="font-display text-2xl text-paper sm:text-3xl">One transaction, three things</h2>
      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        {STEPS.map((item) => (
          <Panel key={item.step} label={`Step ${item.step}`}>
            <h3 className="font-display text-xl leading-tight">{item.title}</h3>
            <p className="mt-2 text-sm leading-6 text-ink-soft">{item.body}</p>
          </Panel>
        ))}
      </div>
    </section>
  );
}
