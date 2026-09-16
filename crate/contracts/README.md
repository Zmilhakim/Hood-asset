# CRATE — contracts

Three contracts on **Uniswap v4**, compiled with solc-js and tested on a local
EVM against Uniswap's own `PoolManager`, deployed as it ships. No Hardhat, no
Foundry, no network access needed.

| Contract      | Job                                                                        |
| ------------- | -------------------------------------------------------------------------- |
| `CrateToken`  | Fixed-supply ERC20. No mint, no owner, no pause.                            |
| `CratePacker` | Packs the crate, once: mints the supply, opens the pool, seals the liquidity. |
| `CrateSeal`   | Owns the liquidity forever. Fees go back into it; nothing comes out.        |

```bash
npm install
npm run compile   # writes out/, PoolManager included
npm test          # compiles, then packs a crate and trades against it
npm run wallets   # makes the two keys — on your machine, not a server
npm run whoami    # which address does the key I stored control?
npm run deploy    # puts CratePacker on chain
npm run pack      # pulls the lever, once — prints the plan first
```

## What packing does

`pack` is a single transaction:

1. Deploys the token and mints the entire fixed supply — 1,000,000,000 CRATE —
   straight to the seal.
2. Opens a v4 pool of **native ETH against CRATE**, with no hook, and prices it
   at the top of the launch range.
3. Tells the seal to put the whole balance in as one position.

Afterwards `packed` is true and there is no second launch. The address that
packed it holds nothing, and neither does the packer contract: the supply was
minted to the seal and never passed through either.

## What v4 changes

**There is no WETH, and no address-ordering puzzle.** The pool's other side is
native ETH, which is `address(0)` and therefore always `currency0`. CRATE is
always `currency1`, so its supply always sits *below* spot. The v3 version of
this needed CREATE2 and an on-chain address prediction purely to work out which
way round the pool would be. That is all gone.

**There is no position NFT.** A v4 position is a row in the pool manager keyed by
the address that added it. The seal is that address, so the position is not a
thing that can be given away, sold, borrowed against or approved to someone by
mistake. It can only shrink if the seal calls `modifyLiquidity` with a negative
delta, and the seal has no such call. Search the file: every liquidity delta in
it is zero or positive.

**There is no hook.** `hooks` is the zero address, and a pool's hook is part of
its key — so it is fixed at launch. No code runs on swaps, there is nowhere to
put an upgrade, and no fee can be switched on later.

## The seal, precisely

`CrateSeal` has no function that removes liquidity, transfers anything, approves
an operator, or names a recipient. Its `take` always names itself and its
`settle` always pays the pool manager; neither is a parameter a caller can set.

So value can enter the crate and cannot leave it. `compound` is the only thing
that moves it once inside: it settles the fees the position has earned and puts
them straight back in as liquidity. Anyone may pay the gas — it takes no
arguments and pays its caller nothing — so there is no privileged party here at
all, not even the address that packed it.

**Fees are not income. They cannot leave.** One honest detail about where they
sit: a position can only take the two currencies together at the pool's current
ratio, so when one side of the pool has earned much more than the other — after a
run of buys and no sells, say — `compound` can only put part of it back, and the
rest waits in the seal. `compound` reverts with `NothingToAdd` when none of it
can be paired yet. Either way the fees are inside the crate: the seal's balance
is as unreachable as the position is.

## The two keys

`npm run wallets` makes them, printed once and saved nowhere. It refuses to run
if stdout is not a terminal, and refuses again if the environment looks like CI
or a hosted workspace — a key is only secret while it has existed in exactly one
place, and a cloud shell is not that place.

**Deployer.** Deploys the packer and is recorded on it as `packer`. It is the
only address `pack` will take orders from, so it matters between `npm run deploy`
and `npm run pack` and only then: lose it in that window and the packer is
stranded, and a new one has to be deployed. After the crate is packed the account
holds no power over the token, the pool or the seal. Fund it with a little ETH
for two transactions.

**Treasury.** Worth being blunt about: **CRATE has no treasury.** No contract
here pays an address, no supply is set aside, and there is no owner or fee to
change that later. Trading fees stay in the crate. So the treasury key is a plain
holding address for whatever you fund yourself, kept separate from the key that
signs deploys — and since it is meant to hold rather than spend, a hardware
wallet is the better answer if you have one.

Before either key signs anything, check you stored the right thing:

```bash
DEPLOYER_KEY=0x… npm run whoami                  # prints the address, never the key
PACKER=0x… DEPLOYER_KEY=0x… npm run whoami       # …and whether that crate answers to it
```

## Pricing the launch

`pack.mjs` turns two numbers into the ones the contract wants:

```bash
export PACKER=0x…          # what deploy.mjs printed
export FLOOR_ETH=1         # the whole supply is worth 1 ETH where selling starts
export CEIL_ETH=300        # …and 300 ETH at the far end of the range
npm run pack               # prints the plan and sends nothing
CONFIRM=pack npm run pack  # sends it
```

Because CRATE is `currency1`, a dearer token is a *lower* tick: the floor price
is the top of the range and the ceiling is the bottom. Spot is initialised at the
top, so the first buy fills immediately and the pool never asks the seal for ETH.
`lib/ticks.mjs` is v4's `TickMath` transliterated rather than approximated,
because a price one tick off the range edge is a launch the packer refuses.

A pool for this pair can be opened and priced by anyone before you get there —
the token's address is predictable from the packer's nonce, and v4 lets a pool be
initialised for a token that does not exist yet. Both the contract and the script
handle it: the contract uses the price that is actually in the pool rather than
reverting, and the script reads that price out of the manager's storage and stops
with an explanation if your range no longer fits under it.

## Testing against the real thing

`test/contracts.test.mjs` deploys Uniswap's `PoolManager` — the shipped contract,
not a model of it — packs the crate into it, buys with ETH, sells back, and then
compounds. So the flash accounting, the tick crossing and the fee growth are
Uniswap's own. `test/ticks.test.mjs` checks the off-chain price math against the
constants Uniswap publishes, and one test checks that the pool id and price
`lib/pool.mjs` derives off-chain are the ones the manager actually has.

The EVM has to be Cancun or later: v4 keeps its lock and its deltas in transient
storage.

## Not deployed

Nothing here is on chain yet, and none of it is audited. `deploy.mjs` and
`pack.mjs` check what they can before spending gas — that the RPC really is
Robinhood Chain (4663), that the pool manager answers like one, that the crate is
not already packed, that the key signing is the one the packer answers to — and
`pack.mjs` simulates the whole transaction against the node before it will
broadcast.
