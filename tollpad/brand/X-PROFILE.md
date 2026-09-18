# Tollpad — X profile kit

Everything needed to set the account up, in the fields X asks for. Character
counts were measured, not estimated; X counts Unicode code points, and the em
dash counts as one.

## Display name — max 50

**Pick this** (15 characters):

```
Tollpad | $TOLL
```

Alternatives: `Tollpad` (7) · `Tollpad — 5% toll, 80% yours` (28)

## Handle

Nothing here is registered yet, and this file will say so until it is. Check
these in order and write down which one you took, with the date — a handle
somebody else holds can be pointed at anything, and the only defence is that
the real one is written somewhere people can check:

1. `@tollpad`
2. `@gettollpad`
3. `@tollpad_xyz`

`@hoodpad` was taken when Hoodpad went looking, which is the ordinary outcome
rather than the unlucky one. Assume the short one is gone and be glad if it is
not.

## Bio — max 160

**Pick this** (147 characters):

```
Launch a token, charge a toll. 5% of every swap on Uniswap v4, 80% of it to whoever launched it. Supply all in the pool. Liquidity locked for good.
```

Alternatives:

| Count | Text |
| --- | --- |
| 147 | `A launchpad with one fee: 5% of every swap, 80% to the creator. Nothing held back at launch, nothing left to withdraw. Robinhood Chain, Uniswap v4.` |
| 143 | `One hook, one fee. 5% of every swap — 80% of it to whoever launched the token. The supply goes into the pool, and the pool does not open again.` |
| 138 | `Launchpad di Robinhood Chain. Satu fee: 5% tiap swap, 80%-nya buat yang nge-launch. Semua supply masuk pool, likuiditas dikunci selamanya.` |

The last one is the Indonesian version, for an account that posts in Indonesian.
Pick one language and stay in it — a bio in one and a feed in the other reads
like a bio somebody else wrote.

## Website

Leave it empty until there is a domain, and then put the domain there. Do not
put a link to an explorer page in this field: it looks like a website, it is not
one, and it goes stale the first time anything is redeployed.

## Images

| Field | File | Size |
| --- | --- | --- |
| Profile picture | `out/avatar-1000.png` | 1000 × 1000 |
| Header | `out/banner-1500x500.png` | 1500 × 500 |

The avatar is full-bleed yellow on purpose. X crops profile pictures to a
circle, and the end of the gate arm is the part of this mark furthest from the
middle — it is inset further than the logo's own padding so the crop never takes
it.

## What the art deliberately does not say

**No domain and no handle on any image.** X already shows both in its own
profile chrome, and an image repeating them is one more thing that can go stale
or turn out to be wrong. The banner carries the ticker, the venue and the rate
instead — none of which can expire.

This is not a style preference. Hoodpad shipped a banner printing `HOODPAD.FUN`
and `@HOODPAD` when neither was registered. **Do not put a domain or a handle on
an image before it is yours.**

## The numbers on the art are checked

`render.mjs` reads `TOLL_BPS`, `CREATOR_BPS` and `FIXED_SUPPLY` out of the
contract sources and refuses to render if they are not 500, 8000 and one
billion. It also greps `TollLocker.sol` for a `withdraw`, a `collect` or a
negative liquidity delta, and refuses if it finds one — a card saying *locked
permanently* is a claim about a contract, and it is worth exactly as much as the
check behind it.

So: change a rate in the contracts, and the render fails until the copy is
rewritten. That is the intended order.

## Ticker

`$TOLL`. Not `$HOOD`, which is Robinhood's NASDAQ ticker and would read as an
official Robinhood asset to anyone skimming, and not `$PAD`, which is every
launchpad on every chain.
