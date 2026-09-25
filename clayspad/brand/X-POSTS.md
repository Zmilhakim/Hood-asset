# Clayspad — posts

Copy for the account.

**This account is written in English**, as a standing rule. Anything added to
this file follows it.

**No figures in any of them.** The supply, the split, the fee and the range are
constants in the contracts and are published there and nowhere else — see
[`X-PROFILE.md`](X-PROFILE.md#the-rule-no-figures-outside-the-contracts).

Nothing here names an address either. Fill those in from
`../contracts/clayspad.config.json` after deploying, and check each one against
the chain before posting it. A contract address in a post is the one thing
readers cannot verify by reading the post.

Images are generated from [`PROMPTS.md`](PROMPTS.md).

## The pinned one

> Clayspad is a launchpad on Robinhood Chain.
>
> Launch a token and it is one transaction: the token is minted, a Uniswap v4
> pool is opened against ETH, and most of the supply goes into that pool and does
> not come back out.
>
> Every swap after that pays a fee, and most of it is yours for as long as anyone
> trades the token.

## Where the numbers are

> We do not print the numbers in posts.
>
> The supply, the share that goes into the pool, the share that does not, the
> fee and the split are `constant` in `Clayspad.sol` and `ClayHook.sol`. No
> setters, no governance, no admin key.
>
> A number in a post is a screenshot waiting to outlive the version it was true
> for. Read them from the thing that enforces them.

## What "fired" means

> Clay can be worked, wetted and thrown again right up until it goes in the
> kiln. Once it comes out it is ceramic, and there is no process that turns it
> back.
>
> Search `Kiln.sol` for a negative liquidity delta. There is exactly one door
> out of a Uniswap v4 position and that is it, and the file does not contain
> one. No withdraw. No collect. No rescue. No owner.

## Why the fee cannot be changed later

> The rate lives in a Uniswap v4 hook, and a pool's hook is part of its key.
>
> That means it is fixed when the pool is opened. Not governed, not timelocked,
> not "no plans to change it" — a different hook is a different pool. The rate on
> the last day is the rate on the first.

## What a creator actually owns

> Not a treasury. Not an admin key. Not the ability to pull liquidity, because
> that function was never written.
>
> What a creator owns is a share of the fee on every swap, claimable whenever
> they want it, for as long as the token trades. That is the whole of it, and it
> is the point rather than the consolation.

## The part worth being clear-eyed about

> Part of every supply does not go into the pool. It is minted straight to a
> wallet the creator nominates, and it is liquid from the first block — not
> vested, not cliffed, not locked.
>
> There is no vesting contract in this repository. None of the four contracts
> can restrain that wallet. Whoever holds it can sell into any bid that appears.
>
> The exact share is a constant in `Clayspad.sol`. Go and read it before you buy
> anything.

## On the first day

> A pool nobody has bought from holds no ETH. The whole position is still token,
> which is why the first buy fills immediately — and why nothing can be sold
> back into it until somebody has bought first.
>
> That is not a bug and it is not a launch mechanic. It is what a one-sided pool
> is.

## The launch announcement

**Every post in this file is measured.** A free X account stops at 280
characters, and a link counts as 23 whatever its length — X wraps everything
through t.co, so `clayspad.fun` costs 23, not 12. Images cost nothing, so the
picture is always free to attach.

It ends on the deployer wallet, which is the address that **will** deploy the
token — not the token's own address, which does not exist until the launch
transaction is mined. That distinction is the whole value of posting it.
Published in advance, it lets anyone check a launch against it the moment a
fake appears; posted as if it were a contract address, it invites people to buy
something that is not there. Keep the label on it.

Attach `out/post-launch-en.jpg`.

### Use this one — 260 characters

> Clayspad is launching $CLAY on Robinhood Chain.
>
> The kiln has no door: what goes into the pool does not come back out.
>
> clayspad.fun
>
> $CLAY deploys from this wallet and no other:
> 0xBF9a58Ca76739d815d8F2c6D54538E77A0a27485
>
> Anything else is not ours.

### Shorter, if it needs room — 175 characters

> $CLAY is launching on Robinhood Chain.
>
> Deployed from this wallet and no other:
> 0xBF9a58Ca76739d815d8F2c6D54538E77A0a27485
>
> Anything else is not ours.
>
> clayspad.fun

The wallet keeps its 42 characters in both. It is the one thing a reader cannot
get anywhere else, and the first thing an impersonator makes impossible to check
if it was never published. What gets cut instead is explanation — that belongs
on `/learn`, not in the post that announces the thing.

### The follow-up, once it is actually mined

Post this **after** the launch transaction confirms, not before. It carries the
token's own address, which is the one people will trade against — and until the
transaction is mined, that address does not exist.

> $CLAY is live.
>
> Token: 0x…
> Deployed from: 0xBF9a58Ca76739d815d8F2c6D54538E77A0a27485
> Pool: Uniswap v4, against ETH, on Robinhood Chain
>
> The supply split and the fee are in the launchpad contract, unchanged from
> every launch it will ever do. Read it before you buy it.

*Fill the token line in from the launch receipt, and check it against the chain
first — `npm run status` in `../contracts` prints what the pool manager actually
has. An address in a post is the one thing a reader cannot verify by reading the
post.*

## When the first token launches

> First on the shelf: $TICKER.
>
> Contract: 0x…
> Pool: Uniswap v4, ETH pair, on Robinhood Chain
>
> The supply split and the fee are in the launchpad contract, unchanged from
> every other launch. Read it before you buy it.

*Replace the contract line with the real address and check it against the chain
first — `npm run status` prints what the pool manager actually has.*
