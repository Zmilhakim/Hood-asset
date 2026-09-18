# Hood-asset

Brand assets for the Hood universe, plus four things built for Robinhood Chain
(chain id 4663): **Hoodpad**, a launchpad, ticker **$HPAD**; **CRATE**, a single
token, ticker **$CRATE**; **Tollpad**, a launchpad on Uniswap v4 whose pools
charge one 5% toll, ticker **$TOLL**; and **Quadpad**, a 4% one whose launches
all open at the same price, ticker **$QUAD**.

```
hoodpad/     the web app: landing, board, launch form, dashboard
contracts/   the launchpad contracts and their tests
brand/       logo, avatar, banner and OG image, all generated from source
crate/       CRATE: one token, one pool, one seal
tollpad/     Tollpad: a launchpad with a 5% fee hook, its app and brand kit
quadpad/     Quadpad: a 4% launchpad where every launch opens at 1.7 ETH
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

## Tollpad

The third shape, and the only one with a hook. Every pool it opens carries a
Uniswap v4 hook that charges **5% of everything paid in**, in either direction —
80% to whoever launched the token, 20% to the treasury — and the pool's own LP
fee is zero, so that toll is the entire fee schedule. The supply and the lock
work as they do on Hoodpad; what is new is that the rate belongs to the launchpad
rather than to whichever fee tier the pool happened to be opened at, and it is
part of the pool's key, so it cannot be changed after the fact. See
[`tollpad/README.md`](tollpad/README.md).

## Quadpad

The fourth shape. Same hook idea as Tollpad at a different rate — **4% of every
swap, 80% to whoever launched the token** — with one thing neither of the other
launchpads has: **every pool opens at the same price**. One billion tokens, all
of them in the pool, priced so the lot comes to **1.7 ETH**, on the first launch
and the thousandth alike. Elsewhere the poster picks the opening tick, so two
launches on one day can be priced an order of magnitude apart and a buyer has to
work out which.

It is a guarantee rather than a convention because `launch` takes no price
argument at all — not a default, not a validated range; the field does not
exist. The opening tick, the range and the spacing are constants in
`QuadpadFactory`, and a test asserts that of the ABI itself.

Unusually for this repository, the brand was drawn before the contracts, and
`quadpad/brand/numbers.mjs` was honest about it: it held the figures as a
specification and reported `checked: false` on every render until there was
something to check them against. The contracts landed, none of the art changed,
and the checking started. See [`quadpad/README.md`](quadpad/README.md).

Start with [`contracts/README.md`](contracts/README.md) for the mechanism,
[`hoodpad/README.md`](hoodpad/README.md) for running the app, and
[`brand/README.md`](brand/README.md) for the logo and social art.

> Not audited, and not deployed to Robinhood Chain. The app reads that state
> honestly rather than filling the board with placeholders.
