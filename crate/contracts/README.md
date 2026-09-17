# CRATE — contracts

Three contracts on **Uniswap v4**, compiled with solc-js and tested on a local
EVM against Uniswap's own `PoolManager`, deployed as it ships. No Hardhat, no
Foundry, no network access needed.

| Contract      | Job                                                                        |
| ------------- | -------------------------------------------------------------------------- |
| `CrateToken`  | Fixed-supply ERC20. No mint, no owner, no pause.                            |
| `CratePacker` | Packs the crate, once: mints the supply, opens the pool, seals the liquidity. |
| `CrateSeal`   | Owns the liquidity forever. Pays the trading fees to one fixed address.      |
| `CrateRouter` | Buys and sells $CRATE. Trades one pool, holds nothing, has no owner.         |

Compile first, always. `out/` is built rather than committed, so a fresh
checkout — or one that predates a contract — has nothing for the deploy scripts
to read.

```bash
npm install
npm run compile   # writes out/, PoolManager included
npm test          # compiles, then packs a crate and trades against it
npm run wallets   # makes the two keys — on your machine, not a server
npm run whoami    # which address does the key I stored control?
npm run preflight # everything that can be checked before any gas is spent
npm run deploy    # puts CratePacker on chain
npm run pack      # pulls the lever, once — prints the plan first
npm run deploy-router  # the contract the site trades through, after packing
npm run verify    # publish the source, so the seal can be read
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

### The venue

Uniswap v4 is live on Robinhood Chain. These come from Uniswap's own deployment
record, [`deployments/4663.md`](https://github.com/Uniswap/contracts/blob/main/deployments/4663.md):

| Contract | Address |
| --- | --- |
| PoolManager | `0x8366a39CC670B4001A1121B8F6A443A643e40951` |

Deployed 22 May 2026, in transaction
`0x4fb28d4935866f462582c6c931c6f2705e55f5be5eb178c7d8d9329a95c44c41`.

That is the only venue address this launch needs. v4 holds every pool in one
manager, and the pool's other side is native ETH, so there is no factory, no
position manager and no WETH to record — the three things the v3 launchpad in
this repository has to name and cross-check.

Worth knowing if you are comparing the two: **Hoodpad is on Uniswap v3 and CRATE
is on v4**, so they share a chain and a fee tier but not a venue. The same record
lists the v3 factory at `0x1f7d7550b1b028f7571e69a784071f0205fd2efa`, which is
the address Hoodpad deployed against and verified on chain — so the record agrees
with something already known to be right.

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

## Trading it

In v4 there is no pool contract to call. Every pool lives inside the one
manager, and reaching a pool means unlocking that manager and being called back
— which a wallet cannot do by itself. So a trade needs a contract in between,
and `CrateRouter` is the smallest one that does the job honestly:

```
buy(minCrateOut, deadline) payable      spend ETH on CRATE
sell(crateIn, minEthOut, deadline)      sell it back, after an ordinary approve
```

Both revert rather than fill worse than the minimum, or later than the deadline.
Unspent ETH goes back to the buyer in the same transaction.

**Its pool is fixed at deployment.** The constructor reads the key off the
packer, so the router cannot be pointed at another pool, another token, or a
pool with a hook in it — there is no setter and no owner. It holds nothing
between transactions, and has no function that could move a balance out if it
somehow did. That is what makes it reasonable to approve.

Chain 4663 also has Uniswap's own Universal Router, which works too and is the
better choice for anything general. It is not used here because selling through
it needs a Permit2 approval as well as an ERC20 one, and this pool has exactly
one token worth trading. The pool is public either way: nothing about it depends
on this router, and any other interface can reach it.

## Pricing the launch

Fill in `floorEth` and `ceilEth`, then:

```bash
npm run preflight          # nothing is spent, and nothing is committed yet
npm run pack               # prints the plan and still sends nothing
CONFIRM=pack npm run pack  # sends it
```

**Do not chain these with `&&`.** A dry run is a success, so `npm run pack`
exits 0 without sending anything and the next command in the chain runs against
a crate that was never packed. Each step is its own command on purpose: the
plan is printed so somebody reads it.

### The curve this launch uses

`floorEth` 2, `ceilEth` 200 — the supply opens at a 2 ETH valuation and the range
runs to 200, a hundredfold. Simulated against the real pool manager:

| ETH bought | Share of supply | Valuation after |
| --- | --- | --- |
| 0.1 | 4.7% | 2.2 ETH |
| 1 | 34.0% | 4.2 ETH |
| 3 | 63.3% | 10.9 ETH |
| 10 | 90.6% | 59.1 ETH |
| 20 | 99.8% | 194.6 ETH |

Two numbers decide everything else. The **floor** sets what the first buyer can
take: at a 1 ETH floor the first 0.1 ETH takes 9% of the supply, and at 2 ETH it
takes 4.7% — the ceiling barely moves that at all. The **pair** sets the
capacity, which is almost exactly the geometric mean: it takes about
`sqrt(floor × ceil)` ETH of buying to consume the whole supply, so 20 ETH here.
Set that too low and the supply runs out early; too high and the price barely
answers the buying, which on a young chain reads as a dead chart.

Unlike the treasury, this is not a one-way door: nothing reads these two numbers
until `pack`, so they can be changed at any point before it.

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

## Publishing the source

`npm run verify` sends every deployed contract's source to Blockscout. It
spends no gas and needs no key — verification is a claim about source code,
checked by recompiling it, and the chain is not touched.

Run it straight after deploying, because it is not a nicety. The claim this
whole project rests on is that `CrateSeal` has no function that removes
liquidity, and an explorer showing only bytecode turns that into something
people have to take on trust at exactly the moment they are deciding whether
to.

One detail that makes it work. solc resolves imports by calling back, so the
input `compile.mjs` hands it holds only our own files — an explorer given that
would fail on the first OpenZeppelin import. So the callback records what it
answered, `compile.mjs` writes a standalone input with all 57 sources inlined,
and then **recompiles it with no callback and checks the bytecode is identical**
before saving. A verification input that compiles differently is rejected on
submission, which is a slow and confusing way to find out.

Constructor arguments are supplied rather than guessed at: `CrateSeal` and
`CrateToken` were deployed by another contract, so there is no creation
transaction for an explorer to recover them from.

Blockscout's public instance rate-limits, and four contracts — a status read,
a submission and then polling until each one compiles — is more than it allows.
A 429 is the server asking for a pause rather than refusing, so every call to
the explorer goes through `lib/backoff.mjs`: it waits as long as `Retry-After`
asks, or five seconds doubling to two minutes when the server does not say.
Reads go through it too, which is the part worth knowing — a rate-limited read
of the status endpoint answers "not verified", which is indistinguishable from
a contract that is still compiling.

Re-running is safe and is the right response to anything left unverified:
already-verified contracts are skipped after one read, so a second run picks up
where the first was cut off.

## Deployed

CRATE is packed. The addresses are in `crate.config.json` under `deployed`, and
the crate cannot be packed a second time — `pack.mjs` refuses, and so does the
packer itself.

None of it is audited. What the scripts do instead is check what can be checked
before spending gas: `deploy.mjs` and `pack.mjs` confirm the RPC really is
Robinhood Chain (4663), that the pool manager answers like one, that the crate is
not already packed, and that the key signing is the one the packer answers to —
and `pack.mjs` simulates the whole transaction against the node before it will
broadcast.
