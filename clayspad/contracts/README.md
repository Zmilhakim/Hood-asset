# Clayspad — contracts

Four contracts on **Uniswap v4**, compiled with solc-js and tested on a local
EVM against Uniswap's own `PoolManager`, deployed as it ships. No Hardhat, no
Foundry, and no network access needed to run the tests.

| Contract | Job |
| --- | --- |
| `Clayspad` | The shelf. Launches a token, splits the supply, opens the pool, fires the pool's share in — one transaction. |
| `ClayHook` | 4% of everything paid into a pool, either direction. 75% to the creator, 25% to the treasury. |
| `Kiln` | Holds every launch's liquidity, and has no function that gives any back. |
| `ClayToken` | Fixed-supply ERC20, minted once to exactly two addresses. |

Compile first, always. `out/` is built rather than committed, so a fresh
checkout has nothing for the scripts to read.

```bash
npm install
npm run compile   # writes out/, PoolManager included
npm test          # compiles, then launches a token and trades against it
npm run mine      # the salt the hook needs, printed before anything is spent
npm run deploy    # puts the launchpad, the hook and the kiln on chain
npm run launch    # puts one token on the shelf — prints the plan first
npm run status    # what the pool manager says about the shelf, right now
npm run collect   # take the fee you are owed
```

## What a launch does

`launch` is a single transaction, and it costs nothing but gas:

1. Deploys the token, whose constructor mints the entire fixed supply —
   1,000,000,000 — and splits it in that same constructor: **750,000,000 to the
   kiln, 250,000,000 to the supply wallet**.
2. Opens a v4 pool of **native ETH against the token**, with `ClayHook` in the
   key and an **LP fee of zero**, priced at the top of the launch range.
3. Fires the kiln's 750,000,000 in as one position the kiln cannot take back.

## The quarter, stated plainly

A quarter of every supply goes to a wallet the creator nominates, and it is
**liquid from the first block**. Not vested, not cliffed, not locked. No
contract here restrains it and none of them pretends to — `ClayToken` has no
machinery for it at all.

That is the honest cost of this design, and it is worth reading as exactly what
it says: whoever holds that wallet can sell into any bid that appears. The
launchpad's job is not to stop them, it is to make sure nobody had to guess.
The split is a `constant` rather than a launch parameter, so it is the same
quarter for every launch and there is one number to check instead of one per
token — `POOL_BPS` and `SUPPLY_WALLET_BPS` in `Clayspad.sol`.

One thing the quarter is *not*, on day one: sellable. A pool nobody has bought
from holds no ETH — the whole position is still token — so there is nothing to
be paid with. It becomes sellable as the pool fills. `test/contracts.test.mjs`
asserts both halves of that.

## The fee

4% of everything paid into a pool, in either direction. Buy with ETH and the 4%
is taken in ETH; sell the token back and it is taken in the token. 75% goes to
whoever launched it, 25% to the treasury, and both figures are `constant` with
no setter.

The rate lives in the hook, and a pool's hook is part of its key — so it is
fixed when the pool is opened. Not governed, not timelocked: a different hook is
a different pool. Clayspad pools carry an LP fee of zero, so this 4% is the
entire fee schedule and there is no second number to add to it.

The fee is banked as an ERC-6909 claim against the pool manager rather than
taken as cash mid-swap. Taking cash at that point would revert on a pool with no
ETH in it yet, which is every pool until its first buy. `withdraw` redeems the
claims later, in a transaction of its own.

## The range

The pool opens at the **floor** and the range tops out at the **ceiling**, both
quoted in `clayspad.config.json` as market caps for the whole supply rather than
prices per token, because that is how anyone actually thinks about a launch. The
shipped range is **1.7 ETH to 170 ETH** — a hundredfold.

Native ETH is `address(0)` and therefore always `currency0`, which makes the
launched token always `currency1`. A pool prices currency1 in currency0, so what
it quotes is *tokens per ETH* — which runs the opposite way to the price being
asked about. A dearer token is a *lower* tick, so the floor price is the top of
the range and the ceiling is the bottom. `lib/ticks.mjs` does that inversion in
one place, exactly, as a fraction that is never turned into a float.

The whole of the kiln's share goes in below spot, and spot starts at the top of
the range: the point where the token is cheapest, so the first buy fills
immediately and the pool never asks the kiln for ETH it does not have. The
launchpad enforces that — a range reaching above spot reverts.

## The hook's address is mined for

A v4 pool works out which callbacks to make by reading the low 14 bits of the
hook's own address, so the permissions *are* the address. `ClayHook` cannot be
deployed wherever it lands: `Clayspad`'s constructor deploys it with CREATE2
from a salt mined off-chain, and the hook's own constructor checks the result
and reverts if the bits are wrong.

So a mis-mined salt costs a failed deployment rather than a launchpad whose fee
is quietly never charged. `npm run mine` prints the answer before anything is
spent on it; `npm run deploy` mines the same salt again itself.

## Configuration

`clayspad.config.json` holds addresses and two prices. Private keys never go in
it — they reach the scripts through `DEPLOYER_KEY` in the environment, one shell
session at a time, and `loadConfig` refuses to start if anything key-shaped
turns up in the file.

| Key | What it is |
| --- | --- |
| `poolManager` | The Uniswap v4 PoolManager on Robinhood Chain |
| `treasury` | Where the treasury's 25% of every fee goes. **Immutable once deployed** |
| `deployer` | The address that will deploy the launchpad |
| `supplyWallet` | Where the liquid quarter of each supply is sent |
| `launch.floorEth` / `launch.ceilEth` | The range, as market caps for the whole supply |

> Not audited, and not deployed to Robinhood Chain. Everything above describes
> what the code in this directory does, not something running anywhere.
