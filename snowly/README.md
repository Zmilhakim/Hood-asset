# Snowly

A launchpad on **Robinhood Chain** (chain id 4663), ticker **$SNOW**.

Fresh snow is loose. It drifts, it packs down, the wind moves it somewhere else
— nothing about it is settled. Bury it deep enough and it stops being snow at
all: the flakes fuse under their own weight into ice, and no thaw short of
melting the whole glacier takes them apart again. That is the shape of this
launchpad. Everything about a token is loose right up until the launch
transaction, and one of the two things that transaction does is permanent.

A launch is one transaction and costs nothing but gas:

- the supply, fixed at **1,000,000,000**, is minted and split in the token's own
  constructor — **80% to the glacier, 20% to the supply wallet**,
- a Uniswap v4 pool of native ETH against the token is opened, LP fee zero,
  `SnowHook` in the key, priced at the top of the launch range,
- the glacier's 80% goes in as one position the glacier has no function to take
  back.

The pool opens at a market cap of **1.65 ETH** for the whole supply, and the
range tops out at **165 ETH** — a hundredfold.

From then on every swap pays **4.5%**, in either direction — **75% to whoever
launched the token, 25% to the treasury** — and the pool's own LP fee is zero,
so that 4.5% is the entire fee schedule. The rate sits in the pool's key, where
nothing can raise it or switch it off afterwards.

The **20% is liquid from the first block**: not vested, not cliffed, not locked,
and no contract here pretends otherwise. That is the honest cost of the design
and it is a constant rather than a per-launch setting, so there is one number to
check rather than one per token.

```
contracts/   the four contracts, their tests and the scripts that deploy them
web/         the site: the snowfield, a launch form, and what each pool is doing
```

Start with [`contracts/README.md`](contracts/README.md) for the mechanism,
[`web/README.md`](web/README.md) for the site, and [`LAUNCH.md`](LAUNCH.md) for
the order to launch in.

## Deployed

On Robinhood Chain, verified, source published under MIT.

| | |
| --- | --- |
| Launchpad | [`0x0D4841BA415b329Fc24f8De3464D430d2C393890`](https://robinhoodchain.blockscout.com/address/0x0D4841BA415b329Fc24f8De3464D430d2C393890) |
| Fee hook | [`0xAEE7acF3d68a88C35e2d97743fa8f3742f8ae0Cc`](https://robinhoodchain.blockscout.com/address/0xAEE7acF3d68a88C35e2d97743fa8f3742f8ae0Cc) |
| Glacier | [`0x41d7B78cB5Cfce16509D4B8fFf0e572EC43a7C7A`](https://robinhoodchain.blockscout.com/address/0x41d7B78cB5Cfce16509D4B8fFf0e572EC43a7C7A) |
| Treasury | `0x377040eb4E79adBAe8929E315F8cC95e39559921` — immutable |
| Site | [snowly-launch.vercel.app](https://snowly-launch.vercel.app) |

Nothing has been launched through it yet, so the snowfield is empty because it
is empty.

> Not audited.
