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
| `web/` | The site: the catchment, the pour form, and what the grate is holding for you |
| `brand/` | The link preview, the post cards, the image prompts, and the account's copy |
| `LAUNCH.md` | The order to do it in, from an empty chain to a verified token |

## On chain

| | |
| --- | --- |
| Drainpad · the catchment | `0x424aeEf840B9C4E4dCC63B949186d59Eb1C8068b` |
| Grate · the fee hook | `0xa28e1f5A414aE7C22f17D593e675ff6E44d360Cc` |
| Sump · the liquidity | `0x1cF1374612F0539A31670751BaD0867C3a330F46` |

All three are verified on Blockscout and on Sourcify, with their source
published under MIT.

## The numbers are in one place

The supply, the split, what the grate keeps and how it divides, and the range a
pool opens across are `constant`s in the verified source. They are not repeated
on the site, in the brand kit, or in any post — there is one copy, it binds, and
anyone can read it. A second copy is only something that can go stale.

> Not audited.
