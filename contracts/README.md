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

## Deploying

### The venue

Uniswap v3 is live on Robinhood Chain. These come from Uniswap's own
deployment record, [`deployments/4663.md`](https://github.com/Uniswap/contracts/blob/main/deployments/4663.md):

| Contract | Address |
| --- | --- |
| UniswapV3Factory | `0x1f7d7550b1b028f7571e69a784071f0205fd2efa` |
| NonfungiblePositionManager | `0x73991a25c818bf1f1128deaab1492d45638de0d3` |

WETH is deliberately not in that table. `deploy.mjs` reads it off the position
manager instead — the manager stores the WETH it was built against, so the
chain answers the question rather than a documentation page that can drift.

### What the script refuses to do

Before spending a single wei it checks, on chain, that:

- both addresses actually have code;
- the position manager answers `factory()` and `WETH9()` at all — if it does
  not, it is not a v3 position manager;
- the factory it names is the factory you passed. A mismatched pair deploys
  fine and then reverts on every single launch;
- the 1% fee tier reports tick spacing 200, which is what the web app's
  `LAUNCH_TICK_SPACING` assumes. If the tier were disabled or spaced
  differently, launches would revert *after* the token had already been
  deployed.

### Running it

```bash
cd contracts
npm install
npm run compile

export DEPLOYER_KEY=0x…          # never paste this anywhere but your own shell
export DEX_FACTORY=0x1f7d7550b1b028f7571e69a784071f0205fd2efa
export POSITION_MANAGER=0x73991a25c818bf1f1128deaab1492d45638de0d3
export TREASURY=0x…              # receives the posting fee
export POSTING_FEE=0             # wei; 0 makes posting free

npm run deploy
```

It prints the factory address. Put that in `hoodpad/.env.local` as
`NEXT_PUBLIC_FACTORY_ADDRESS`, or in the Vercel project's environment
variables, and the board stops saying "not deployed" on the next build.

The deployer account is not privileged afterwards. It cannot mint, pause,
upgrade, or touch a locked position — the factory has no owner at all. Only
`TREASURY` keeps a role, and only to receive posting fees.

## What is not here

- No audit. These contracts have not been reviewed by anyone.
- No upgrade path, by design. A deployed board is the board.
- No testnet rehearsal in this repo. Robinhood Chain has a public testnet
  (chain id 46630); deploying there first costs nothing and is the only way to
  see a real launch go through before real money is involved.
