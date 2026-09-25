# Drainpad

A launchpad on Robinhood Chain. One transaction prints a token's whole fixed
supply, opens a Uniswap v4 pool of native ETH against it, and sinks the pool's
share into a contract with no way to pump it back out. The rest is minted to a
wallet the creator nominates, liquid from the first block and restrained by
nothing.

Everything that flows through a pool crosses the grate, and the grate keeps a
share of it — split between whoever launched the token and the treasury, at a
rate fixed in the pool's own key.

| | |
| --- | --- |
| `contracts/` | The four contracts, the tests, and the scripts that deploy, launch and verify them |
| `LAUNCH.md` | The order to do it in, from an empty chain to a verified token |

The numbers — the supply, the split, the fee and its shares — are `constant`s in
the verified source. Read them there.

> Not audited.
