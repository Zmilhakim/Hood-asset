# Tollpad

A launchpad on **Uniswap v4** where the fee is the product.

Launch a token: the whole supply goes into a pool against native ETH, the pool is
locked, and every swap after that pays a **5% toll** — 80% to whoever launched
the token, 20% to the treasury. Launching costs nothing but gas. Nothing is held
back, because there is nowhere to hold it.

```
contracts/   the factory, the hook, the locker, and their tests
site/        the web app: landing, board, launch form, dashboard
brand/       logo, avatar, banner, OG image and the X profile kit
```

## The shape of it

| | |
| --- | --- |
| **Fee** | 5% of everything paid into the pool, either direction |
| **Split** | 80% creator, 20% treasury |
| **Pool fee** | Zero. The toll is the whole schedule |
| **Supply** | 1,000,000,000, all of it in the pool |
| **Liquidity** | Locked, permanently |
| **Cost to launch** | Gas |
| **Chain** | Robinhood Chain (4663), Uniswap v4 |

The rate lives in a hook, and a pool's hook is part of its key — so it is fixed
when the pool opens. Not governed, not timelocked, not *no plans to change it*: a
different hook is a different pool.

## How it compares to the rest of this repository

Hoodpad is the same idea on **Uniswap v3**: a board anyone can post to, supply
fixed, liquidity locked, and the poster keeps the pool's trading fees. CRATE is
one token launched once on v4 with no hook at all.

Tollpad is the third shape. It is on v4 *and* it has a hook, which is what makes
the fee a thing the launchpad sets rather than a thing the pool tier happens to
be — one rate, charged on the way in, split on a schedule nobody can edit
afterwards.

| | Hoodpad | CRATE | Tollpad |
| --- | --- | --- | --- |
| Venue | Uniswap v3 | Uniswap v4 | Uniswap v4 |
| Hook | — | none, on purpose | the toll, 5% |
| Launches | many | exactly one | many |
| Fee to the creator | the pool's LP fee | — | 80% of the toll |
| Liquidity | locked | locked | locked |

## Start here

[`contracts/README.md`](contracts/README.md) for the mechanism, the hook address
mining and how to deploy it. [`site/README.md`](site/README.md) for running the
app. [`brand/README.md`](brand/README.md) for the logo and social art, and
[`brand/X-PROFILE.md`](brand/X-PROFILE.md) for the account.

## The two keys

`npm run wallets` in `contracts/` makes them, printed once and saved nowhere. It
refuses to run unless stdout is a terminal, and refuses again if the environment
looks like CI or a hosted workspace — **a key is only secret while it has existed
in exactly one place, and a cloud shell is not that place.**

**Deployer.** Sends one transaction. The launchpad has no owner and no admin
afterwards: `launch` is open to anybody, the split is a constant, and the
treasury is an immutable. Fund it with a little ETH.

**Treasury.** Receives 20% of every toll from every launch, forever. It is
written into the hook as an `immutable` at deployment and nothing changes it
afterwards, so a typo is a typo forever — `deploy.mjs` reads the address back off
the chain and refuses to go on if it is not the one that was asked for. It should
be a hardware wallet address rather than a generated key: it never signs anything
except `withdraw`.

> Not audited, and not deployed. `tollpad.config.json` has no addresses under
> `deployed` because there is nothing there yet, and the scripts read that state
> honestly rather than filling it with placeholders.
