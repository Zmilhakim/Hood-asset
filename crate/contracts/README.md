# CRATE — contracts

Three contracts on **Uniswap v4**, compiled with solc-js and tested on a local
EVM against Uniswap's own `PoolManager`, deployed as it ships. No Hardhat, no
Foundry, no network access needed.

| Contract      | Job                                                                        |
| ------------- | -------------------------------------------------------------------------- |
| `CrateToken`  | Fixed-supply ERC20. No mint, no owner, no pause.                            |
| `CratePacker` | Packs the crate, once: mints the supply, opens the pool, seals the liquidity. |
| `CrateSeal`   | Owns the liquidity forever. Pays the trading fees to one fixed address.      |

```bash
npm install
npm run compile   # writes out/, PoolManager included
npm test          # compiles, then packs a crate and trades against it
npm run wallets   # makes the two keys — on your machine, not a server
npm run whoami    # which address does the key I stored control?
npm run preflight # everything that can be checked before any gas is spent
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

## Two promises, and they are not the same one

**The liquidity never comes out.** Everything anyone pays to buy CRATE, minus the
fee, becomes liquidity, and liquidity leaves a v4 pool through exactly one door:
a `modifyLiquidity` with a negative delta. There is no such call in `CrateSeal`.
Every liquidity delta in the file is zero or positive. Not the treasury, not the
packer, not the seal on anyone's behalf can shrink the position — and because a
v4 position is a row in the pool manager rather than an NFT, there is nothing to
transfer, sell, borrow against or approve away either.

**The trading fees do come out, to one address.** `collectFees` pays them to
`feeBeneficiary`, which is set in the seal's constructor as an `immutable`. There
is no setter, under any spelling. Where the fees go was decided before the token
existed and cannot be moved afterwards. The call is permissionless, because
permission would change nothing: the destination is fixed, so all a caller can do
is pay the gas.

What that earns, precisely: on a 1% pool, **one ETH of buying pays the treasury
0.01 ETH.** The other 0.99 becomes liquidity and is never coming back. This is
the part worth being clear-eyed about — locked liquidity means the money people
pay for supply is locked, for you as much as for anyone.

One v4 detail the seal has to handle: *every* `modifyLiquidity` settles the
position's accrued fees into the caller's delta, whatever the call was for. So an
add could quietly absorb the fees into the position instead of paying them out.
`compound` pays the fees out first, in the same transaction, so that can never
happen — there is a test for exactly this.

**What the seal holds is not fees.** The dust left over from packing, and
anything anyone sends the contract, can only go one way: into the position, via
`compound`. It is never paid to the treasury. A position also takes the two
currencies together at the pool's current ratio, so `compound` reverts with
`NothingToAdd` when the balance cannot be paired yet, and it waits.

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

**Treasury.** Receives the pool's trading fees, forever. It is written into the
seal as an `immutable` at deployment and nothing changes it afterwards, so a typo
is a typo forever — `deploy.mjs` reads the address back off the chain after
deploying and refuses to go on if it is not the one you passed. It never signs
anything, so it should not be a hot key at all: use a hardware wallet address
here and skip the generated key.

No supply is set aside for it, and no contract pays it anything but fees.

`deploy.mjs` also refuses to run if the key loaded is not the address
`crate.config.json` names as the deployer — the config says who should be
packing, the environment says who is about to, and they have to agree.

Before either key signs anything, check you stored the right thing:

```bash
DEPLOYER_KEY=0x… npm run whoami                  # prints the address, never the key
PACKER=0x… DEPLOYER_KEY=0x… npm run whoami       # …whether that crate answers to it,
                                                 #    and where its fees are committed
```

## The launch, written down

Everything public about the launch lives in `crate.config.json`, and every script
reads it from there:

```json
{
  "chainId": 4663,
  "poolManager": "",       // the Uniswap v4 PoolManager on Robinhood Chain
  "treasury": "",          // where the fees go, forever
  "deployer": "",          // the address that deploys and packs — its address, not its key
  "launch": {
    "fee": 10000,          // 1%
    "tickSpacing": 200,
    "floorEth": "",        // the whole supply is worth this much where selling starts
    "ceilEth": ""          // …and this much at the far end of the range
  },
  "deployed": { }          // deploy.mjs and pack.mjs fill this in
}
```

Addresses are public, so they belong in a file that gets reviewed in a diff
rather than retyped at a prompt — `treasury` in particular, since it is
immutable from `npm run deploy` onwards. **Keys never go in it.** They reach the
scripts through `DEPLOYER_KEY` in your shell, and `loadConfig` refuses to run at
all if anything in the file is 66 characters of hex.

Any single value can still be overridden for one run (`TREASURY=0x… npm run
preflight`), which is for trying something, not for launching.

### Preflight

`npm run preflight` sends nothing and needs no key. It checks the config parses
and the addresses are real — including the EIP-55 checksum, which is what catches
one transposed character — then that the RPC is the chain the config names, that
the pool manager answers like one, that the deployer has gas, and that the prices
describe a range the packer will accept. After deploying it also reads the seal
back and confirms the fee address on chain is the one in the file.

One check worth knowing about: **it warns if the treasury is a contract.** The
pool pays native ETH with a plain call and reverts if the recipient refuses it,
so a contract with no payable `receive` would make `collectFees` — and
`compound` — revert forever. An ordinary account or a hardware wallet is always
fine; a contract needs checking first.

## Pricing the launch

Fill in `floorEth` and `ceilEth`, then:

```bash
npm run preflight          # nothing is spent, and nothing is committed yet
npm run pack               # prints the plan and still sends nothing
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
not a model of it — packs the crate into it, buys with ETH, sells back, collects
the fees and compounds. So the flash accounting, the tick crossing and the fee growth are
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
