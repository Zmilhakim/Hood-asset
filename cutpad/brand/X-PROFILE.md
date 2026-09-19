# Cutpad — X profile kit

Everything needed to set the account up, in the fields X asks for. Character
counts were measured, not estimated; X counts Unicode code points, and the em
dash counts as one.

## Display name — max 50

**Pick this** (15 characters):

```
Cutpad | $CUT
```

Alternatives: `Cutpad` (7) · `Cutpad — 3% cut, 80% yours` (28)

## Handle

Nothing here is registered yet, and this file will say so until it is. Check
these in order and write down which one you took, with the date — a handle
somebody else holds can be pointed at anything, and the only defence is that
the real one is written somewhere people can check:

1. `@cutpad`
2. `@getcutpad`
3. `@cutpad_xyz`

`@hoodpad` was taken when Hoodpad went looking, which is the ordinary outcome
rather than the unlucky one. Assume the short one is gone and be glad if it is
not.

## Bio — max 160

Two picks, because the account should be in one language and stay in it. A bio in
English over a feed in Indonesian reads like a bio somebody else wrote.

**English** (147 characters):

```
Launch a token, charge a cut. 3% of every swap on Uniswap v4, 80% of it to whoever launched it. Supply all in the pool. Liquidity locked for good.
```

**Indonesian** (138 characters):

```
Launchpad di Robinhood Chain. Satu fee: 3% tiap swap, 80%-nya buat yang nge-launch. Semua supply masuk pool, likuiditas dikunci selamanya.
```

### The rest of them

English:

| Count | Text |
| --- | --- |
| 145 | `The fee is the product. 3% of every swap, 80% of it to whoever launched the token, and the rate sits in the pool's key where nobody can raise it.` |
| 147 | `A launchpad with one fee: 3% of every swap, 80% to the creator. Nothing held back at launch, nothing left to withdraw. Robinhood Chain, Uniswap v4.` |
| 143 | `One hook, one fee. 3% of every swap — 80% of it to whoever launched the token. The supply goes into the pool, and the pool does not open again.` |
| 145 | `Launch for the price of gas. Keep 80% of a 3% cut on every swap after that. Supply fully in the pool, liquidity locked, no allocation to anyone.` |
| 105 | `3% of every swap. 80% of it yours. The rest of the trade goes into a pool nobody can drain — us included.` |

Indonesian:

| Count | Text |
| --- | --- |
| 146 | `Launch cuma bayar gas. Habis itu tiap swap kena cut 3% — 80% buat kamu, terus-terusan. Supply masuk pool semua, likuiditasnya nggak bisa ditarik.` |
| 144 | `Satu hook, satu fee: 3% tiap swap di Uniswap v4, 80% buat creator. Nggak ada presale, nggak ada jatah tim, nggak ada yang bisa narik likuiditas.` |
| 141 | `Fee-nya yang jadi produk. 3% tiap swap, 80% buat yang nge-launch, dan tarifnya nempel di pool — nggak bisa dinaikin atau dimatiin belakangan.` |
| 102 | `3% tiap swap. 80%-nya punya kamu. Sisanya masuk pool yang nggak bisa dikuras siapa pun, termasuk kami.` |

### How to pick

The short ones read better on a phone, where X truncates a bio to about two
lines before anyone has to tap. The long ones say the two numbers *and* what
happens to the liquidity, which is the question every launchpad gets asked
second.

Whichever you take, the bio makes the same two claims the contracts make — **3%**
and **80%** — and those are checkable: `CUT_BPS` and `CREATOR_BPS` in
`CutHook.sol`, constants with no setter. Change one and this file is wrong, so
change this file too.

One thing to leave out of all of them: **a number nobody can check yet**. No
"$2M locked", no "1,000 launches", no APR. Everything above is true of a
launchpad on its first day, which is the day the bio gets written.

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

`render.mjs` reads `CUT_BPS`, `CREATOR_BPS` and `FIXED_SUPPLY` out of the
contract sources and refuses to render if they are not 500, 8000 and one
billion. It also greps `CutLocker.sol` for a `withdraw`, a `collect` or a
negative liquidity delta, and refuses if it finds one — a card saying *locked
permanently* is a claim about a contract, and it is worth exactly as much as the
check behind it.

So: change a rate in the contracts, and the render fails until the copy is
rewritten. That is the intended order.

## Ticker

`$CUT`. Not `$HOOD`, which is Robinhood's NASDAQ ticker and would read as an
official Robinhood asset to anyone skimming, and not `$PAD`, which is every
launchpad on every chain.
