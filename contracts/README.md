# Hoodpad — contracts

Three contracts, compiled with solc-js and tested on a local EVM. No Hardhat,
no Foundry, no network access needed.

| Contract          | Job                                                                   |
| ----------------- | --------------------------------------------------------------------- |
| `HoodpadFactory`  | The board. Posts notices, launches tokens, opens and locks the pool.   |
| `HoodToken`       | Fixed-supply ERC20. No mint, no owner, no pause.                       |
| `PositionLocker`  | Holds launch liquidity forever; forwards trading fees to the poster.   |

```bash
npm install
npm run compile   # writes out/ and regenerates the app's ABIs
npm test          # compiles first, then runs the invariants
npm run deploy    # see deploy.mjs for the env vars it needs
```

## What one launch does

`postToken` is a single transaction:

1. Deploys the token with CREATE2 and mints the entire fixed supply to the factory.
2. Creates the Uniswap v3 pool, initialises it, and mints one position holding
   the whole supply and no ETH.
3. Sends that position to `PositionLocker` and burns whatever dust is left.

### The part worth reading twice

Tick math lives off-chain, where it belongs — but the invariant that makes the
launch single-sided is enforced on-chain. The contract reads the pool's tick
after initialisation and rejects any range that straddles it, so the position
manager can never pull ETH from the poster and the poster can never keep a
slice of the supply.

That only works if the caller knows which side of the pool the token will land
on, which depends on its address. Hence CREATE2 and `predictToken`: callers read
the address the launch *will* produce, compare it against WETH, and compute
their ticks against the answer. `test/contracts.test.mjs` checks `predictToken`
against a CREATE2 address recomputed independently from the standalone artifact
— if solc ever embedded different creation code inside the factory, that test
fails rather than every launch.

## What is not here

- No audit. These contracts have not been reviewed by anyone.
- No upgrade path, by design. A deployed board is the board.
- The Uniswap v3 addresses are constructor arguments, not constants. Whether a
  v3 deployment exists on Robinhood Chain, and at which addresses, is something
  to verify before deploying — `deploy.mjs` refuses to run against an address
  with no code, which catches a typo but not a wrong-but-real address.
