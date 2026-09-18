# Hoodpad — contracts, v4

The board, rebuilt on **Uniswap v4**, where the project's fee is charged by a
hook rather than left to the LP position. Four contracts, compiled with solc-js
and tested on a local EVM against Uniswap's own `PoolManager`, deployed as it
ships. No Hardhat, no Foundry, no network access needed.

| Contract         | Job                                                                       |
| ---------------- | ------------------------------------------------------------------------- |
| `HoodpadFactory` | The board. Posts notices, launches tokens, opens the pool, locks the position. |
| `HoodFeeHook`    | Takes 5% of every swap and credits it to that notice's poster.             |
| `HoodpadLocker`  | Holds every launch's liquidity forever; pays LP fees to the poster.        |
| `HoodToken`      | Fixed-supply ERC20. No mint, no owner, no pause.                           |

Compile first, always. `out/` is built rather than committed, so a fresh
checkout has nothing for the scripts to read.

```bash
npm install
npm run compile    # writes out/, PoolManager included, and the app's v4 ABIs
npm test           # compiles, launches, trades, and tries to get the liquidity back
npm run wallet     # a fresh key, on your machine, printed once, saved nowhere
npm run preflight  # everything checkable before any gas is spent
npm run deploy     # puts the board, the hook and the locker on chain
npm run launch     # post one notice through a deployed board
npm run status     # read the board: prices, supply left, unclaimed fees
npm run collect    # sweep one notice's fees to its poster
```

## What a trader pays

Two fees, on two different ledgers, and it is worth keeping them apart:

| | Charged by | Goes to | Collected with |
| --- | --- | --- | --- |
| **5%** | `HoodFeeHook`, on every swap | the poster | `claim` on the hook |
| **1%** | the pool's own LP fee | the poster | `collectFees` on the locker |

**So a swap costs about 6% in total.** That is high, deliberately, and it is the
number to argue with before deploying rather than after: `FEE_BPS` is a constant
in `HoodFeeHook`, the hook is part of every pool's key, and a pool's key cannot
be changed. Nothing about that 5% is adjustable once a notice is posted.

### How high the hook could go, and why it stops there

**100% of the swap's unspecified side, and not one basis point more.** Uniswap
does not enforce that — `Hooks.afterSwap` subtracts whatever `int128` a hook
returns from the swapper's delta, with no ceiling anywhere in v4-core. The limit
is arithmetic rather than a rule, and it is a cliff:

| Hook fee | What happens |
| --- | --- |
| under 100% | the swap works; the trader keeps the rest |
| exactly 100% | the swap succeeds and the trader receives **nothing** |
| over 100% | the swapper's side goes negative, and **every swap reverts** |

The last row is unrecoverable. A pool's hook is part of its key, so a pool opened
against a hook charging 101% can never be traded again by anyone. `MAX_FEE_BPS`
and the check in the hook's constructor exist for exactly that: it is the one
edit to that file that would compile, deploy, launch, and only then brick every
pool it touched.

None of which makes a high fee a good one. The pool's own LP fee has its own cap
— `LPFeeLibrary.MAX_LP_FEE` is 1,000,000 hundredths of a bip, also 100% — so the
protocol would happily let a launch charge 200% across the two and simply stop
working. Routers and aggregators give up long before that.

The two fees also arrive in different currencies, which surprises people:

- The hook takes its cut from the swap's *unspecified* side — the output of an
  exact-input swap. So **buying pays the hook in the token** and **selling pays
  it in ETH**. A poster's earnings on a busy launch are mostly their own token
  until people start selling.
- The pool takes its LP fee from the *input* side. So a buy accrues an ETH-side
  LP fee and a sell accrues a token-side one.

`npm run collect` prints both, in both currencies, before it sends anything.

## What one launch does

`postToken` is a single transaction:

1. Deploys the token and mints the whole fixed supply straight to the locker. It
   never passes through the factory or the poster's hands.
2. Opens a v4 pool of native ETH against the token, carrying the hook, and
   prices it at the top of the launch range.
3. Registers the poster on the hook as that pool's fee beneficiary — once, and
   never again.
4. Tells the locker to put the entire supply in as one position.

Nothing is held back: no supply for the board, none for the poster, none for the
treasury. What a poster earns is fees, and never the liquidity.

## What v4 changed from the v3 board

**There is no address-ordering puzzle.** The pool's other side is native ETH,
which is `address(0)` and therefore always `currency0`. The token is always
`currency1`, so its supply always sits *below* spot. The v3 board needed CREATE2
and an on-chain `predictToken` purely to work out which way round the pool would
be; all of that is gone, and with it the whole class of launches that got the
answer wrong.

**There is no position NFT.** A v4 position is a row in the pool manager keyed by
the address that added it. The locker is that address, so the position is not a
thing that can be transferred, sold, borrowed against or approved away by
mistake. It can only shrink through a `modifyLiquidity` with a negative delta,
and there is no such call in `HoodpadLocker`. Search the file: every liquidity
delta in it is zero or positive.

**There is a hook, and it is permanent.** A pool's hook is part of its key, so it
is fixed at launch. There is no owner on the hook, no setter for the fee, and no
upgrade path — nothing can be switched on later that is not on now.

## The part worth reading twice: where the hook lives

Uniswap v4 does not ask a hook which callbacks it wants. It reads them out of the
**low 14 bits of the hook's own address**. `HoodFeeHook` needs two:

```
AFTER_SWAP_FLAG                1 << 6
AFTER_SWAP_RETURNS_DELTA_FLAG  1 << 2      ->  0x44
```

So the hook has to *land* on an address ending in those bits, which means CREATE2
with a salt found by trying salts until one fits. About two thousand tries, and
under a tenth of a second.

The CREATE2 is run by the factory, which does not exist yet when the salt is
mined. So `deploy.mjs` predicts the factory's address from the deployer's nonce,
mines the salt against that prediction, and then **pins that nonce on the
transaction** so the prediction cannot come untrue in between.

If it came untrue anyway, `BaseHook`'s constructor rejects the address and the
whole deployment reverts. A wrong salt costs gas, never a board whose swaps all
fail.

## Deploying

### The venue

Uniswap v4 is live on Robinhood Chain (4663). The pool manager address lives in
[`hoodpad.config.json`](hoodpad.config.json), which is where it can be read back
and reviewed rather than retyped at a prompt.

### The two addresses

**Deployer.** Deploys the board and pays the gas. It holds **no privilege
afterwards** — the factory has no owner, cannot mint, cannot pause, cannot touch
a locked position, and cannot move where a fee goes. It matters only during the
deploy.

It may be the same address that deployed the v3 board, and nothing technical
objects: a plain `CREATE` lands on a new address for every nonce, the hook's salt
is mined against whichever deployer is actually used, and there is no fixed salt
anywhere that could collide. The reason to use a fresh one is not safety but
attribution — the same address ties this board publicly to everything else it
has deployed.

**Treasury.** Receives the posting fee, which is zero by default, and nothing
else. It is an immutable on the factory. Use a different address from the
deployer, on a hardware wallet if you have one.

```bash
npm run wallet
```

Generates a fresh key on your machine, prints it once, saves it nowhere. It
refuses to run if its output is being piped or redirected, because that is how a
key ends up in a file or a log.

A private key is only secret while it has existed in exactly one place. One that
has been pasted into a chat, an issue, a DM or a CI log is not secret any more,
regardless of who sent it or how fast it was deleted. Nobody — no support agent,
no teammate, no AI — needs to see it.

### Running it

```bash
npm run compile
npm run preflight                 # free, and finds most mistakes

export DEPLOYER_KEY=0x…           # never paste this anywhere but your own shell
node deploy.mjs                   # simulate: addresses, salt, gas. Sends nothing.
node deploy.mjs --go              # actually deploy
```

It writes the factory, hook and locker addresses back into
`hoodpad.config.json`, and prints the environment variable the web app needs.

### Posting a notice

```bash
export DEPLOYER_KEY=0x…           # this account becomes the poster
export NAME="Test Hood" SYMBOL=TESTHOOD

node launch.mjs                   # simulate, print the plan, spend nothing
node launch.mjs --go              # post it
```

`OPENING` and `CEILING` set the market cap in ETH at the two ends of the range —
1 and 100 by default, the same as the v3 board. `IMAGE`, `BLURB` and `LINK` fill
in the notice.

## Tests

`test/venue.mjs` boots a local EVM carrying Uniswap's own `PoolManager` — the
shipped artifact, not a mock — mines the hook salt exactly the way `deploy.mjs`
does, and puts the board on top. A launch there mints, opens a pool, dispatches
into the hook on every swap and locks the position the same way it would on
Robinhood Chain.

`test/launch.test.mjs` asserts the things only a working venue can settle: the
pool holds the entire supply and nobody else holds any; the position exists,
carries liquidity, sits on the planned ticks and belongs to the locker; the pool
opened at exactly the price the launch asked for; a range that straddles spot is
refused rather than half-funded; two notices get two pools and the second does
not absorb the first's dust.

`test/hook.test.mjs` is about the fee. It buys and sells against a real pool and
checks that the hook's cut is exactly 5% of what the pool paid out — measured
against the trader's own balance, not recomputed from the same formula — that
buys pay in the token and sells pay in ETH, that `claim` pays the poster and
nobody else, that the hook's ledger and the LP fee are genuinely separate, and
that collecting either one leaves the liquidity untouched.

Both suites also assert the absences: no `mint`, no `owner`, no `withdraw`, no
`setFee`, under any spelling. An absence is easy to lose in a refactor and hard
to notice, so it is tested rather than assumed.

## What is not here

- No audit. These contracts have not been reviewed by anyone.
- No upgrade path, by design. A deployed board is the board.
- No rehearsal on a real chain. The tests run a full launch against real Uniswap
  bytecode, but in a local EVM with no other traders, no gas market and nobody
  else's pools. Robinhood Chain has a public testnet (chain id 46630); deploying
  there costs nothing and is the only way to watch a launch and a swap go through
  under real conditions before real money is involved.
- No claim that 6% is a sensible total fee. It is the number that was asked for,
  implemented exactly and documented honestly.
