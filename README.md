# Hood-asset

Brand assets for the Hood universe, plus two things launched on Robinhood Chain
(chain id 4663): **Hoodpad**, a launchpad, ticker **$HPAD**, and **CRATE**, a
single token, ticker **$CRATE**.

```
hoodpad/     the web app: landing, board, launch form, dashboard
contracts/   the launchpad contracts and their tests
brand/       logo, avatar, banner and OG image, all generated from source
crate/       CRATE: one token, one pool, one seal
*.png        the original Hood character art
```

Hoodpad posts every token to one on-chain board. A launch is a
single transaction: the supply is minted, the whole of it opens a single-sided
pool, and the position is locked where nobody — including whoever posted it —
can take it back. Trading fees stay claimable by the poster; the liquidity does
not.

| Route        | What it is                                                    |
| ------------ | ------------------------------------------------------------- |
| `/`          | The pitch: what it does, how it works, straight answers        |
| `/board`     | The live feed of notices, read from the chain                  |
| `/launch`    | Post a notice                                                  |
| `/dashboard` | Your notices and the fees your locked positions earned         |
| `/learn`     | The mechanism, and what it does not promise                    |

## CRATE

A separate project, and the opposite shape: Hoodpad is a board anyone can post
to, CRATE is one token that is launched once. The supply opens a single pool and
the position goes into a contract with no way out, so trading fees cannot be
paid to anyone — the only thing that can be done with them is to put them back
into the same position. See [`crate/README.md`](crate/README.md).

Start with [`contracts/README.md`](contracts/README.md) for the mechanism,
[`hoodpad/README.md`](hoodpad/README.md) for running the app, and
[`brand/README.md`](brand/README.md) for the logo and social art.

> Not audited, and not deployed to Robinhood Chain. The app reads that state
> honestly rather than filling the board with placeholders.
