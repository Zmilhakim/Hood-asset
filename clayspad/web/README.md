# Clayspad — web

The site. Next.js 15, wagmi and viem, reading Robinhood Chain directly — there
is no backend, no indexer and no database. Every figure on a page is a live read
of the launchpad or the pool manager at the moment the page loads.

```bash
npm install      # add --maxsockets 1 if the install fails renaming cache files
npm run abi      # regenerate the ABIs from ../contracts/out
npm run dev
npm run build
npm run typecheck
```

| Route | What it is |
| --- | --- |
| `/` | The pitch: what a launch does, and straight answers. No figures on it at all |
| `/shelf` | Every launch, newest first, read from the chain |
| `/piece/[id]` | One launch: price, what is in the pool, what is left, how it was split |
| `/launch` | Post one. One transaction, and it costs nothing but gas |
| `/dashboard` | What this address launched, and what the fee has banked for it |
| `/learn` | The mechanism, and what it deliberately does not promise |

## Nothing is deployed, and the site says so

`NEXT_PUBLIC_CLAYSPAD_ADDRESS` is unset, so `SHELF_IS_OPEN` is false, every
chain read is disabled, and a banner across the top says the launchpad is not
deployed. **The shelf is empty because it is empty, not because it is loading**,
and the pages say which of those two it is.

That is deliberate. A launchpad that fills its first day with sample tokens has
taught its readers that what it shows is not necessarily real, and that is the
one lesson it cannot afford to teach. Set the address and everything switches
on, including the disappearance of the banner — it cannot be left up by mistake
and it cannot be taken down early.

| Variable | Default |
| --- | --- |
| `NEXT_PUBLIC_CLAYSPAD_ADDRESS` | none — the site runs in preview until it is set |
| `NEXT_PUBLIC_POOL_MANAGER` | the v4 PoolManager in `../contracts/clayspad.config.json` |
| `NEXT_PUBLIC_RPC_URL` | Robinhood's own public endpoint, which is rate-limited |
| `NEXT_PUBLIC_EXPLORER_URL` | Blockscout |
| `NEXT_PUBLIC_SITE_URL` | Vercel's production hostname, then localhost |

## The ABIs are generated, not typed out

`npm run abi` writes `src/lib/abi/*.ts` from `../contracts/out/*.json`, keeping
only the functions this app calls. It fails loudly if a function it wants has
been renamed or removed, rather than leaving a page that silently shows nothing.

Run it after any change to the contracts. `out/` is built by `npm run compile`
in `../contracts` and is not committed, so a fresh checkout needs that first.

## No figure is written into this app

The supply, the split, the swap fee and the creator's cut are constants in the
contracts, and this site does not restate them. The landing page carries no
figures at all — not one — and the product pages carry only what they read live
from the chain: a price out of the pool's own `slot0`, a market cap derived from
that price and the token's own `totalSupply`, what is in the position and what
is left on the shelf.

`src/lib/format.ts` returns `null` for anything it could not derive, and
`<Stat>` renders an em dash for null. A launchpad showing `0` for something it
simply could not fetch has told its reader something false.

## The one piece of maths worth testing

`src/lib/pool.ts` is Uniswap's tick maths, transliterated rather than
approximated — the price per token is the *reciprocal* of what a v4 pool quotes,
because native ETH is address zero and therefore always `currency0`. Getting
that backwards produces a figure that looks plausible and is wrong by a factor
of 10^18, which is exactly the kind of number that ends up in a screenshot.

`src/lib/pool.test.ts` covers it. `npm test` needs a Node built with TypeScript
support; on a build without it the tests will not run.

> Not audited, and not deployed.
