# CRATE — contracts

Three contracts, compiled with solc-js and tested on a local EVM against a
Uniswap stand-in. No Hardhat, no Foundry, no network access needed.

| Contract      | Job                                                                      |
| ------------- | ------------------------------------------------------------------------ |
| `CrateToken`  | Fixed-supply ERC20. No mint, no owner, no pause.                          |
| `CratePacker` | Packs the crate, once: mints the supply, opens the pool, seals the position. |
| `CrateSeal`   | Holds the position forever. Fees go back into it; nothing comes out.      |

```bash
npm install
npm run compile   # writes out/
npm test          # compiles first, then packs a crate on a local EVM
npm run deploy    # puts CratePacker on chain
npm run pack      # pulls the lever, once — prints the plan first
```

## What packing does

`pack` is a single transaction:

1. Deploys the token with CREATE2 and mints the entire fixed supply — 1,000,000,000
   CRATE — to the packer.
2. Creates the Uniswap v3 pool, initialises it, and mints one position holding
   the whole supply and no ETH.
3. Sends that position to `CrateSeal` and burns whatever dust is left.

Afterwards `packed` is true and there is no second launch. The address that
packed it holds nothing, because the supply never rested there: it went from
mint to pool inside one call.

## The two parts worth reading twice

**The launch is single-sided, and that is enforced on chain.** Tick math lives
off-chain, where it belongs, but the contract reads the pool's tick after
initialisation and rejects any range that straddles it. So the position manager
can never pull ETH from the packer, and the packer can never keep a slice of the
supply. That only works if the caller knows which side of the pool the token will
land on, which depends on its address — hence CREATE2 and `predictToken`.
`test/contracts.test.mjs` checks `predictToken` against a CREATE2 address
recomputed independently from the standalone artifact: if solc ever embedded
different creation code inside the packer, that test fails rather than the
launch.

**The seal is structural, not a promise.** `CrateSeal` has no function that
decreases liquidity, transfers the position, approves an operator on it, or
sends a balance to an address the caller picks. It calls `collect` in exactly one
place, with the recipient hardcoded to itself, and the only thing that call can
lead to is `increaseLiquidity` back into the same position. Anyone may pay the
gas for that — `compound` takes no arguments and pays the caller nothing — so
there is no privileged party, not even the address that packed it.

What this means in practice: trading fees are not income. They are liquidity.
The crate only gets heavier.

One honest edge: a position sitting entirely on one side of spot only absorbs
one of the two tokens, so the other waits in the seal until the range is
crossed and a later `compound` can use it. It is inside the seal either way,
and there is no path that takes it back out.

## Pricing the launch

`pack.mjs` turns two numbers into the four the contract wants:

```bash
export PACKER=0x…          # what deploy.mjs printed
export FLOOR_ETH=1         # the whole supply is worth 1 ETH where selling starts
export CEIL_ETH=300        # …and 300 ETH at the far end of the range
npm run pack               # prints the plan and sends nothing
CONFIRM=pack npm run pack  # sends it
```

Spot is initialised at the near edge of the range, so the first buy fills
immediately and the pool never asks for ETH. `lib/ticks.mjs` is Uniswap's
`TickMath` transliterated rather than approximated, because a price one tick
off the range edge is a launch the packer refuses.

A pool for this pair can be created and priced by anyone before you get there.
Both the script and the contract handle that: the contract uses the price that
is actually in the pool, and the script checks your range against it and stops
with an explanation rather than a revert.

## Not deployed

Nothing here is on chain yet, and none of it is audited. `deploy.mjs` and
`pack.mjs` check what they can before spending gas — that the RPC really is
Robinhood Chain (4663), that the position manager and factory name each other,
that the fee tier exists, that the crate is not already packed, that the key
signing is the one the packer answers to — and `pack.mjs` simulates the whole
transaction against the node before it will broadcast.
