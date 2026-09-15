# Hood-asset

Brand assets for the Hood universe, plus **Hoodpad** — a launchpad on Robinhood
Chain (chain id 4663).

```
hoodpad/     the web app: the board, the launch form, the dashboard
contracts/   the launchpad contracts and their tests
*.png        logos and social art for the Hood tokens
```

Hoodpad posts every token and every drop to one on-chain board. A launch is a
single transaction: the supply is minted, the whole of it opens a single-sided
pool, and the position is locked where nobody — including whoever posted it —
can take it back. Trading fees stay claimable by the poster; the liquidity does
not.

Start with [`contracts/README.md`](contracts/README.md) for the mechanism and
[`hoodpad/README.md`](hoodpad/README.md) for running the app.

> Not audited, and not deployed yet. The app reads that state honestly rather
> than filling the board with placeholders.
