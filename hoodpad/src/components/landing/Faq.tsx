const QUESTIONS = [
  {
    q: "Do I need ETH to launch?",
    a: "Only gas, plus the posting fee if one is set. The pool opens with the token alone — the contract rejects any price range that would let it ask you for ETH.",
  },
  {
    q: "Can the liquidity be pulled?",
    a: "No. The position is held by a contract with no withdraw, no transfer and no way to reassign it. That is the code, not a promise — read PositionLocker.sol.",
  },
  {
    q: "What do I keep?",
    a: "The trading fees your locked position earns, claimable any time from the dashboard. Not the liquidity itself, and not a share of the supply.",
  },
  {
    q: "Is a locked pool a safe buy?",
    a: "No. It means the liquidity cannot be pulled. It says nothing about whether a token is worth anything. Names and art are typed in by whoever posted them and are not checked.",
  },
] as const;

export function Faq() {
  return (
    <section>
      <h2 className="font-display text-2xl text-paper sm:text-3xl">Straight answers</h2>
      <dl className="mt-4 grid gap-4 md:grid-cols-2">
        {QUESTIONS.map((item) => (
          <div key={item.q} className="paper-grain pin-shadow border-2 border-ink bg-paper p-4 sm:p-5">
            <dt className="font-display text-lg leading-tight text-ink">{item.q}</dt>
            <dd className="mt-2 text-sm leading-6 text-ink-soft">{item.a}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
