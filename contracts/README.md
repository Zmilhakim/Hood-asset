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
npm test          # compiles first, then runs the invariants and a full launch
npm run deploy    # see deploy.mjs for the env vars it needs
npm run launch    # post one token through a deployed board
npm run status    # read the board: prices, supply left, unclaimed fees
npm run collect   # sweep a locked position's trading fees to its poster
npm run node      # a local chain to rehearse against
```

## Launching a token

`launch.mjs` posts a token through a deployed board from the command line. It
does what the form on hoodpad.site does — same factory, same tick maths,
imported from the web app rather than copied — and simulates the whole
transaction against live state before anything is spent.

```bash
export DEPLOYER_KEY=0x…          # the account that posts and pays gas
export NAME="Test Hood"
export SYMBOL=TESTHOOD

node launch.mjs                  # simulate, print the address, spend nothing
node launch.mjs --go             # actually post it
```

`OPENING` and `CEILING` set the market cap in ETH at the two ends of the range
(1 and 100 by default). `IMAGE`, `BLURB` and `LINK` fill in the notice.
`FACTORY` and `RPC_URL` both default to the live deployment.

Without `--go` nothing is sent: the script prints the address the token will
land on, the range, and what the gas will cost, then stops. The salt is
regenerated on every run, so the address changes between a rehearsal and the
real thing.

## Reading the board

`status.mjs` reports what the board looks like right now. It needs no private
key and sends nothing — every figure comes off the chain.

```bash
node status.mjs            # every notice, newest first
node status.mjs 1          # one notice by id
WATCH=0x… node status.mjs  # also report that wallet's gas and fees
```

For each notice it prints the token and pool addresses, the current price and
market cap in ETH, how much of the supply is still unsold, how much WETH the
pool has taken in, and the trading fees the poster has not collected yet.

Unclaimed fees are read by simulating the collect the beneficiary would send,
not by reading `tokensOwed` off the position. Those two disagree: `tokensOwed`
only updates when the position is touched, so a pool that has been trading
quietly reports zero until someone pokes it.

## Collecting fees

The dashboard on the site does this, but it needs a browser with an injected
wallet — which on a phone means opening the site inside a wallet's own browser.
`collect.mjs` needs a terminal and the key that is already in it.

```bash
export DEPLOYER_KEY=0x…     # the poster's account; nobody else may collect

node collect.mjs 1          # show what notice #1 would pay out, send nothing
node collect.mjs 1 --go     # collect it
```

It refuses early and says why when the key belongs to someone other than the
poster, rather than letting the locker's revert explain it. Collecting never
touches the position: the liquidity stays locked, and the test suite checks
that the locker still owns it afterwards.

WETH comes back wrapped. Unwrap it in a wallet if plain ETH is wanted.

### Rehearsing without a chain

`tools/local-node.mjs` serves the test venue over JSON-RPC, so the launch
script can be run against something that answers like a chain:

```bash
npm run node                     # prints the board address it just deployed
DEPLOYER_KEY=0x…  RPC_URL=http://127.0.0.1:8545  FACTORY=0x…  \
  NAME="Test Hood" SYMBOL=TESTHOOD node launch.mjs --go
```

It is not a chain — one transaction per block, no mempool, no other traders,
and every account it is asked about gets funded. It exists so the script's own
plumbing is exercised by running it rather than assumed to work.

## Tests

`test/contracts.test.mjs` checks the rules Hoodpad enforces on its own, against
stubbed venue addresses — address prediction, the fixed supply, the locker's
refusals, the absence of an NFT surface.

`test/launch.test.mjs` runs the launch itself. `test/venue.mjs` boots a local
EVM carrying a real WETH9, the published `UniswapV3Factory`, and the published
`NonfungiblePositionManager` — their shipped artifacts, not mocks — and puts
Hoodpad on top. A launch there mints, opens a pool and locks the position the
same way it would on Robinhood Chain, so the test can assert the things only a
working venue can settle:

- the token lands on the address `predictToken` promised;
- the pool holds the entire supply, and the factory, the locker and the poster
  hold none of it;
- the LP position exists, carries liquidity, sits on the planned ticks, and is
  owned by the locker;
- the pool opened at the price the launch asked for;
- `planLaunch` — the tick maths the web app ships, imported straight out of
  `hoodpad/src/lib/pool.ts` — produces a range the contract accepts on both
  pool orderings, and a range that straddles spot is refused instead of
  half-funded.

The suite asserts the pool init code hash the position manager has baked in
still matches the pool artifact. If a future version of those packages ships a
recompiled pool, every mint in the test would be aimed at an address that does
not exist, and the test would quietly stop proving anything.

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

## Live deployment

Robinhood Chain (4663), deployed 2026-09-16.

| | |
| --- | --- |
| HoodpadFactory | `0xC935a139AbB08a2eF8480d8E793CCD5c68a7c739` |
| Deploy tx | `0xe5dadf6796010c78ab9ca293b0e1378cbdf7e15f5f0d22a4008829d7ba1bde51` |
| Deployer | `0xA5E1d280EF25B5CD0768deBBaEa2Ee9e0ae56E81` (no privilege after deployment) |
| Treasury | `0xdB7bdDBAEc91679BF4abbaf5BA11EF4E028c73A3` (immutable) |
| Posting fee | 0 — posting is free, so the treasury receives nothing |

`PositionLocker` was deployed by the factory's constructor; read its address
from `locker()` on the factory rather than trusting a copy of it here.

The pre-flight checks passed against the live chain: the position manager
named the same factory that was passed in, and the 1% tier reported tick
spacing 200. The Uniswap addresses below are therefore confirmed, not just
sourced.

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

### A deployer key

```bash
npm run wallet
```

Generates a fresh key on your machine, prints it once, saves it nowhere. It
refuses to run if its output is being piped or redirected, because that is how
a key ends up in a file or a log.

A private key is only secret while it has existed in exactly one place. One
that has been pasted into a chat, an issue, a DM or a CI log is not secret any
more, regardless of who sent it or how fast it was deleted. Nobody — no
support agent, no teammate, no AI — needs to see it.

A browser wallet works just as well: make a fresh account in MetaMask or Rabby,
add Robinhood Chain (chain id 4663), and export that account's key when you
deploy.

Either way, fund the address with ETH on Robinhood Chain first, and use a
different address for `TREASURY` — that one keeps receiving fees long after
the deploy, so it belongs on a hardware wallet if you have one.

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
- No rehearsal on a real chain. `test/launch.test.mjs` runs a full launch
  against real Uniswap bytecode, but in a local EVM with no other traders, no
  gas market and no one else's pools. Robinhood Chain has a public testnet
  (chain id 46630); deploying there costs nothing and is the only way to watch
  a launch go through under real conditions before real money is involved.
