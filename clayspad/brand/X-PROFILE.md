# Clayspad — X profile kit

Everything needed to set the account up, in the fields X asks for. Character
counts were measured rather than estimated; X counts Unicode code points, and
the em dash counts as one.

**No figures anywhere in here.** The supply, the split, the fee and the range
are constants in the contracts and are published there and nowhere else — see
[the rule](#the-rule-no-figures-outside-the-contracts) at the bottom.

## Display name — max 50

**Pick this** (16 characters):

```
Clayspad | $CLAY
```

Alternatives: `Clayspad` (8) · `Clayspad — a launchpad, fired shut` (34)

## Handle

Nothing here is registered yet, and this file will say so until it is. Check
these in order and write down which one you took, with the date — a handle
somebody else holds can be pointed at anything, and the only defence is that the
real one is written somewhere people can check:

1. `@clayspad`
2. `@getclayspad`
3. `@clayspad_xyz`

Assume the short one is gone and be glad if it is not. `@hoodpad` was taken when
Hoodpad went looking, which is the ordinary outcome rather than the unlucky one.

## Bio — max 160

Two picks, because the account should be in one language and stay in it. A bio
in English over a feed in Indonesian reads like a bio somebody else wrote.

**English** (151 characters):

```
A launchpad on Robinhood Chain. Launch a token in one transaction: most of the supply is fired into the pool for good, and every swap pays the creator.
```

**Indonesian** (131 characters):

```
Launchpad di Robinhood Chain. Launch token dalam satu transaksi: sebagian besar supply dibakar ke pool dan nggak bisa ditarik lagi.
```

### The rest of them

English:

| Count | Text |
| --- | --- |
| 137 | `A launchpad on Robinhood Chain. The kiln has no door: what goes into the pool does not come back out. Everything else is in the contract.` |
| 133 | `Launch a token in one transaction. The supply split, the fee and the range are constants in the contract — read them there, not here.` |
| 100 | `A launchpad on Robinhood Chain. Launch it, and keep earning from it for as long as anyone trades it.` |

Indonesian:

| Count | Text |
| --- | --- |
| 125 | `Launchpad di Robinhood Chain. Tungkunya nggak punya pintu: yang masuk pool nggak bisa keluar lagi. Selebihnya ada di kontrak.` |
| 122 | `Launch token dalam satu transaksi. Pembagian supply, fee, dan range-nya constant di kontrak — baca di sana, bukan di sini.` |
| 94 | `Launchpad di Robinhood Chain. Launch sekali, terus dapat bagian tiap kali ada yang menukarnya.` |

### How to pick

The short ones read better on a phone, where X truncates a bio to about two
lines before anyone has to tap. The longer ones get "does not come back out" in,
which is the one property of this launchpad that is worth a reader's attention
before they have read anything else.

**"Most of the supply" is the strongest claim any of these can make**, and it is
true. Do not let it slide into "the whole supply" or "all of it" — that would be
false, and it is the exact shape of mistake the no-figures rule exists to
prevent.

## Website

Leave it empty until there is a domain, and then put the domain there. Do not
put a link to an explorer page in this field: it looks like a website, it is not
one, and it goes stale the first time anything is redeployed.

## Images

You are generating these in Google Flow from [`PROMPTS.md`](PROMPTS.md). What is
worth knowing before you do:

| Field | Size | What it has to survive |
| --- | --- | --- |
| Profile picture | 1000 × 1000 | X crops it to a **circle**. Anything in the corners is gone, and anything near the edge is gone on some clients. Use prompt 1A — no wordmark, it would be cropped off. |
| Header | 1500 × 500 | Cropped differently on mobile and desktop, and the bottom-left is covered by the avatar on both. Keep that corner empty. Use prompt 3. |
| Link preview | 1200 × 630 | Goes in the OG tag once there is a site, not on the profile. Use prompt 4. |

The text that goes on the banner is in [`BANNER-COPY.md`](BANNER-COPY.md).

**No domain and no handle on any image**, even added afterwards, until they are
registered. X already shows both in its own profile chrome, and an image
repeating them is one more thing that can go stale or turn out to be wrong.

This is not a style preference. Hoodpad shipped a banner printing `HOODPAD.FUN`
and `@HOODPAD` when neither was registered. **Do not put a domain or a handle on
an image before it is yours.**

**And no figures on any image either.** Not the supply, not the split, not the
fee. See below.

## The rule: no figures outside the contracts

The supply, the share fired into the pool, the share that stays liquid, the swap
fee, the creator's cut, the opening market cap and the top of the range are
**constants in `Clayspad.sol` and `ClayHook.sol`, and that is the only place
they are published.** Not in the bio, not in a post, not on the banner, not on
the site.

The reasoning is the same one the contracts are written on: the code is the
specification, and marketing does not get to restate a specification in its own
words. Anything restated can drift from what it describes, gets screenshotted,
and outlives the version it was true for. A reader who wants the numbers reads
them from the thing that enforces them.

The one consequence to stay aware of: **the copy cannot make the disclosure
either.** The share of every supply that stays liquid is the most material thing
a buyer needs to know, and under this rule it is not in the bio or the posts. It
has to stay easy to find somewhere public — right now that is
`clayspad/README.md` and `contracts/README.md`, both of which state it in full.
Keep it that way.

## Ticker

`$CLAY`. Not `$HOOD`, which is Robinhood's NASDAQ ticker and would read as an
official Robinhood asset to anyone skimming, and not `$PAD`, which is every
launchpad on every chain.
