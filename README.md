# Hood-asset

Brand assets for the Hood universe, plus two things built for Robinhood Chain
(chain id 4663): **Hoodpad**, a launchpad, ticker **$HPAD**, and **CRATE**, a
single token, ticker **$CRATE**. Two more were built here and moved out —
[Toollpad](#toollpad-lives-in-its-own-repository-now) and
[Quadpad](#quadpad-lives-in-its-own-repository-too).

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
to, CRATE is one token that is launched once. The supply opens a single Uniswap
v4 position against native ETH, owned by a contract with no way to give it back.
The guarantee is the same one Hoodpad makes — trading fees are claimable, the
liquidity never is — but here it is settled at deployment rather than per notice:
the fee address is an immutable with no setter. See
[`crate/README.md`](crate/README.md).

## Toollpad lives in its own repository now

**[Zmilhakim/toollpad](https://github.com/Zmilhakim/toollpad)** — a launchpad on
Uniswap v4 whose pools charge one 5% toll, ticker **$TOLL**. It was built here
and moved out before anything was deployed, with its history intact.

It moved because one repository feeding several Vercel projects means every push
rebuilds all of them — seven builds for a change that touched one folder, which
is how a day's deployment quota disappears without anything being wrong. New
projects get their own repository from the start.

## Quadpad lives in its own repository too

**[Zmilhakim/Quad](https://github.com/Zmilhakim/Quad)** — a launchpad on Uniswap
v4 that charges **4% of every swap**, 80% of it to whoever launched the token,
ticker **$QUAD**. Live at
**[quadpad-phi.vercel.app](https://quadpad-phi.vercel.app)**.

It has one thing neither of the other launchpads has: **every pool opens at the
same price**. A billion tokens, all of them in the pool, priced so the lot comes
to 1.7 ETH — on the first launch and the thousandth alike. Elsewhere whoever
posts picks the opening tick, so two launches on one afternoon can be priced an
order of magnitude apart and a buyer has to work out which before they can read
either chart.

It is a guarantee rather than a convention because `launch` takes no price
argument at all — not a default, not a validated range; the field does not
exist. The opening tick, the range and the spacing are constants in the factory,
and a test asserts that of the ABI itself.

It was drawn here and built in its own repository, following the rule the
section above arrived at: new projects get their own repository from the start.

Start with [`contracts/README.md`](contracts/README.md) for the mechanism,
[`hoodpad/README.md`](hoodpad/README.md) for running the app, and
[`brand/README.md`](brand/README.md) for the logo and social art.

> Not audited, and not deployed to Robinhood Chain. The app reads that state
> honestly rather than filling the board with placeholders.
