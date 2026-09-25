# Clayspad

A launchpad on **Robinhood Chain** (chain id 4663), ticker **$CLAY**.

Clay is worked, wetted and thrown again right up until it goes in the kiln. Once
it comes out it is ceramic, and there is no process that turns it back. That is
the shape of this launchpad: everything about a token is adjustable until the
launch transaction, and one of the two things it does is irreversible.

A launch is one transaction and costs nothing but gas:

- the supply, fixed at **1,000,000,000**, is minted and split in the token's own
  constructor — **75% to the kiln, 25% to the supply wallet**,
- a Uniswap v4 pool of native ETH against the token is opened, LP fee zero,
  `ClayHook` in the key, priced at the top of the launch range,
- the kiln's 75% goes in as one position the kiln has no function to take back.

From then on every swap pays **4%**, in either direction — **75% to whoever
launched the token, 25% to the treasury** — and the pool's own LP fee is zero,
so that 4% is the entire fee schedule. The rate sits in the pool's key, where
nothing can raise it or switch it off afterwards.

The **25% is liquid from the first block**: not vested, not cliffed, not locked,
and no contract here pretends otherwise. That is the honest cost of the design
and it is a constant rather than a per-launch setting, so there is one number to
check rather than one per token.

```
contracts/   the four contracts, their tests and the scripts that deploy them
web/         the site: the shelf, a launch form, and what each pool is doing
brand/       the copy, the palette, and the prompts the images are generated from
```

[`LAUNCH.md`](LAUNCH.md) is the order to launch in, start to finish.

Start with [`contracts/README.md`](contracts/README.md) for the mechanism,
[`web/README.md`](web/README.md) for running the site, and
[`brand/PROMPTS.md`](brand/PROMPTS.md) for the images.

> Not audited, and not deployed. The treasury address is not set yet, which is
> the one value that cannot be changed after deployment.
