# Cutpad — posts

Copy for the account, with the image each one goes out with. Nothing here names
an address: fill those in from `cutpad.config.json` after deploying, and check
each one against the chain before posting it. A contract address in a post is
the one thing readers cannot verify by reading the post.

## The pinned one

> Cutpad is a launchpad where the fee is the product.
>
> Launch a token: the whole supply goes into a Uniswap v4 pool, the pool is
> locked, and every swap after that pays a 3% cut. 80% of it is yours.
>
> No presale. No allocation. No unlock. Nothing to hold back.

*Image: `out/og-1200x630.png`*

## How the fee works

> One fee, both directions.
>
> Buy: 3% of the ETH you put in. Sell: 3% of the tokens you put in. That is the
> whole schedule — the pool itself charges nothing, so there is no second number
> to read.
>
> 80% to whoever launched the token. 20% to the treasury.

*Image: `out/cut-1600x900.png`*

## Why it cannot be changed later

> The rate lives in a Uniswap v4 hook, and a pool's hook is part of its key.
>
> That means it is fixed when the pool is opened. Not governed, not timelocked,
> not "no plans to change it" — a different hook is a different pool. The rate on
> the last day is the rate on the first.

## What a creator actually owns

> You launch, and you end the transaction holding zero tokens. That is not a
> catch, it is the point: the supply never passes through your hands, so there is
> nothing you could dump if you wanted to.
>
> What you own is 80% of the cut, for as long as anyone trades it.

## The part worth being clear-eyed about

> Locked liquidity means locked. Everything anyone pays for the supply becomes
> liquidity and does not come back out — not for the creator, not for us, not by
> vote.
>
> The cut comes out. The liquidity does not. Those are two different promises
> and we would rather you knew which is which.

## When the first token launches

> First notice on the board: $TICKER.
>
> Supply: 1,000,000,000, all of it in the pool.
> Locked: permanently.
> Cut: 3%, 80% to the creator.
> Contract: 0x…
>
> Read it before you buy it.

*Image: `out/cut-1600x900.png`. Replace the contract line with the real address
and check it against the chain first — `npm run status` prints what the pool
manager actually has.*
