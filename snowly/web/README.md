# Snowly — the site

The snowfield, a launch form, and what each pool is doing. Next.js App Router,
wagmi for the wallet, and no backend: every figure on every page is read from
the chain in the browser.

```bash
npm install
npm run abi        # regenerate the ABIs from ../contracts/out
npm run dev
npm run build
```

`npm run abi` reads `../contracts/out`, which `npm run compile` builds next
door. The ABIs are generated rather than hand-copied, and the script fails loudly
if a function the app calls has been renamed — the alternative is a page that
silently shows nothing.

## Pages

| Route | What it is |
| --- | --- |
| `/` | The overview: what a launch does, the live figures, the last ten drifts |
| `/snowfield` | Every launch, newest first, as a table |
| `/drift/[id]` | One token: price, market cap, what is in the pool, where the supply went |
| `/launch` | The form. Prints the plan from what you type, before you sign |
| `/fees` | What the hook owes you, and the button that takes it |
| `/how` | The mechanism, including what it honestly does not restrain |

## Nothing is written down twice

The three deployed addresses are in `src/lib/contracts.ts`; everything else —
every launched token, every split, every fee figure — is read back out of the
launchpad. The constants the header prints are constants in the contract, but
they are fetched rather than typed, because a number typed into a web page is a
claim that nothing checks.

`src/lib/pool.ts` is the one place prices are computed. A v4 pool quotes
currency1 in currency0, and native ETH is address zero and so always currency0 —
what the pool counts is *tokens per ETH*, which runs the opposite way to the
price anybody asks about. Getting that backwards gives a figure that looks
plausible and is wrong by 10^18.

## Configuration

Every one of these is optional; the defaults are the deployed launchpad on
Robinhood Chain.

| Variable | What it overrides |
| --- | --- |
| `NEXT_PUBLIC_SNOWLY` | The launchpad address |
| `NEXT_PUBLIC_SNOW_HOOK` | The fee hook |
| `NEXT_PUBLIC_GLACIER` | The liquidity contract |
| `NEXT_PUBLIC_POOL_MANAGER` | The Uniswap v4 PoolManager |
| `NEXT_PUBLIC_RPC_URL` | The RPC the browser reads through |
| `NEXT_PUBLIC_EXPLORER_URL` | Where the ↗ links go |
| `NEXT_PUBLIC_SITE_URL` | The canonical origin, for metadata |

A malformed address in any of them is ignored rather than obeyed. A truncated
value in an env var should not turn every page blank.

## The look

Daylight on snow: a light field, one blue that means meltwater, a serif for
headings and tabular figures everywhere a number appears. The navigation is a
rail down the left rather than a bar across the top, because the snowfield is a
list that wants the full height of the window.

This is deliberately not the other launchpads in this repository. Each one
should read as its own product rather than one template with the colours
swapped.
