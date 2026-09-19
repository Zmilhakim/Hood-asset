# Hoodpad — launch posts

Written for `@gethoodpad`. Character counts were measured, not estimated; X
counts Unicode code points, and every count below is in the table at the end.

Addresses appear in full rather than shortened. A launchpad asking to be
checked cannot make checking harder than reading.

---

## 1. Pinned post

```
Hoodpad is a launchpad on Robinhood Chain.

One transaction: mint 1B, open a Uniswap v3 pool holding all of it, lock the position forever.

No team allocation. No mint function afterwards. No owner. Posting costs nothing.

hoodpad.site
```

## 2. $HPAD

Post this second, quoting or replying to the pinned post.

```
$HPAD went through Hoodpad like everything on the board.

1,000,000,000 minted, all of it into the pool
LP locked, permanently
Nothing held back

token
0xA3B16698b0dff316dC3214Ab5C2D31DeBcB03096

posted by
0xA5E1d280EF25B5CD0768deBBaEa2Ee9e0ae56E81

Notice #1. Read it yourself.
```

### Follow-up, once it has traded

Only true after a trade. The figures come from `status.mjs`; replace them with
whatever it reports rather than these.

```
The first trades went through $HPAD's pool.

The 1% they paid did not go to Hoodpad. It went to the wallet that posted the
notice, which is the only thing a poster ever keeps.

The liquidity did not move, and cannot. Collecting fees is the one thing that
can leave the locker.
```

## 3. The lock

A standalone post, for after the launch has been announced. It answers the
question the announcement raises rather than repeating it: every launchpad
says the liquidity is locked, so why believe this one.

Goes out with `brand/out/lock-1600x900.png`, which prints the locker's whole
function list beside the ones it does not have.

```
Every launchpad says the liquidity is locked.

Most mean a contract that could release it, owned by someone promising not to.

Hoodpad's locker has six functions and none of them move a position. Not disabled. Absent. There is no key, because no lock was ever fitted.
```

Two alternates, both true, both weaker right now:

- *"Someone traded $HPAD, so the mechanism got tested rather than described…"* —
  accurate, but the volume behind it is a few dollars. A reader who checks will
  find the claim thin. Worth posting once the figures carry it.
- *"Posting a token on Hoodpad costs nothing…"* — sells the board rather than
  giving anyone a reason to trust it. Better as a third post than a second.

---

## Posts that ask people to launch

Aimed at someone deciding where to put their own token, not at someone
deciding whether to buy $HPAD. Every one of them says the fee is theirs and
the contracts are unreviewed, because a launchpad that recruits by omission
gets found out by the first person who reads the code.

### The offer

```
Launching on Hoodpad costs nothing but gas.

No ETH for liquidity — the supply opens the pool on its own.
You keep the 1% your pool charges, for as long as it trades.
The LP is locked by a contract with no release function.

Unaudited. Read it first.

hoodpad.site/launch
```

### What it proves to their buyers

The strongest one. A launcher's hardest problem is being believed, and this is
the only thing Hoodpad hands them that they cannot fake anywhere else.

```
The hardest thing to prove to people buying your token is that you will not pull the liquidity.

On Hoodpad you cannot, and they can check it in a minute: the locker has no transfer, no withdraw, no decreaseLiquidity.

You still keep the trading fees.

hoodpad.site/launch
```

### For anyone without capital

```
You do not need ETH to launch a token on Hoodpad.

The supply is the liquidity. It opens a pool on its own, priced from whatever valuation you set, and the position is locked where nobody can reach it — including us.

Gas is the only cost.

hoodpad.site/launch
```

### The mechanism, plainly

```
One transaction on Hoodpad:

mint 1,000,000,000
open a pool holding all of it
lock the position for good

No ETH of yours goes in, and nothing is held back for us — posting is free, and that zero is immutable in a contract with no owner.

hoodpad.site/launch
```

---

## 4. Thread

### 1/

```
Every launchpad says the liquidity is locked.

Most mean a contract that could release it, owned by someone who promises not to.

Hoodpad's locker has no function that moves a position. Not disabled — absent. There is no key, because no lock was ever fitted.
```

### 2/

```
What one transaction does:

mint 1,000,000,000 tokens
open a Uniswap v3 pool
put the entire supply in as single-sided liquidity
send the LP position to the locker
burn the rounding dust

The token contract has no mint function, no owner, no pause.
```

### 3/

```
Single-sided means the whole supply sits in a price range above spot.

No ETH needed to launch. Nothing is held back to "seed" anything.

The first trade has to be a buy — there is no ETH in the pool until someone puts it there.
```

### 4/

```
The locker has six functions:

beneficiaryOf
collectFees
factory
lock
onERC721Received
positionManager

No transfer. No withdraw. No decreaseLiquidity. No approve.

Trading fees go to whoever posted the notice. The principal goes nowhere, ever.
```

### 5/

```
Posting a notice costs 0.

Not "0 for now" — the fee is immutable in a contract with no owner and no upgrade path. Nobody can raise it later, including me.

Board: 0xC935a139AbB08a2eF8480d8E793CCD5c68a7c739
```

### 6/

```
What this is not:

Not audited. I wrote tests that run a full launch against real Uniswap bytecode, and they pass. That is not the same as review by someone who does this for a living.

Read the contracts before you trust them. That is the whole point.
```

### 7/

```
hoodpad.site

Board, launch form, and every figure read straight from the chain rather than a database.

Robinhood Chain, id 4663.

Deployer: 0xA5E1d280EF25B5CD0768deBBaEa2Ee9e0ae56E81

Check what it holds. That is the claim.
```

---

## Measured counts

| Post | Characters |
| --- | --- |
| Pinned | 235 |
| $HPAD | 278 |
| Follow-up | 276 |
| The lock | 267 |
| Recruit: offer | 271 |
| Recruit: proof | 272 |
| Recruit: no capital | 260 |
| Recruit: mechanism | 258 |
| Thread 1/ | 258 |
| Thread 2/ | 247 |
| Thread 3/ | 228 |
| Thread 4/ | 244 |
| Thread 5/ | 206 |
| Thread 6/ | 252 |
| Thread 7/ | 225 |

All within X's 280. The addresses are the reason several sit in the 240s —
shortening them would buy room that nothing needs.

## Addresses used

| What | Address |
| --- | --- |
| $HPAD token | `0xA3B16698b0dff316dC3214Ab5C2D31DeBcB03096` |
| $HPAD pool | `0x7261DBa9A5A166db229c3F9A32779d261a7A2349` |
| Board (factory) | `0xC935a139AbB08a2eF8480d8E793CCD5c68a7c739` |
| Position locker | `0x645588B3468cdC18f599651aE7c98869011899CE` |

## What these posts deliberately do not say

No price target, no "early", no multiplier, and no claim that the contracts are
safe. The only asset here is that every sentence can be checked, and one
unverifiable line spends it.

Post 6 is not a disclaimer bolted on for cover. A thread that lists its own
weakness is read differently from one that does not, and the weakness is real.
