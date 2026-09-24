# Clayspad — banner copy

The text that goes on the empty left side of the banner, set in an editor after
the art comes back from Google Flow.

**No figures anywhere in here.** Not the supply, not the split, not the fee, not
a market cap. Those live in the contracts and nowhere else — see
[the rule](#the-rule-no-figures-outside-the-contracts) at the bottom.

Pick one option and one language and stay in it. A headline in English over a
feed in Indonesian reads like a headline somebody else wrote.

Every line below is 34 characters or shorter. A banner is read at thumbnail size
more often than at full size, and a line that wraps on a phone stops being a
headline and becomes a paragraph.

---

## A. The announcement

What to run now, before there is anything deployed to point at.

**English**

```
CLAYSPAD
LAUNCHING ON ROBINHOOD CHAIN

Launch a token in one transaction.
```

**Indonesian**

```
CLAYSPAD
SEGERA DI ROBINHOOD CHAIN

Launch token dalam satu transaksi.
```

## B. The kiln

The one that reads best beside this particular render: a sealed platform with a
portal burning in the middle of it *is* a kiln with no door. The art and the
line are saying the same thing, which is the only reason to put words next to a
picture at all.

**English**

```
CLAYSPAD
LAUNCHING ON ROBINHOOD CHAIN

The kiln has no door.
```

**Indonesian**

```
CLAYSPAD
SEGERA DI ROBINHOOD CHAIN

Tungkunya nggak punya pintu.
```

## C. The creator

Leads with what a creator gets rather than with what the machine does.

**English**

```
CLAYSPAD
LAUNCHING ON ROBINHOOD CHAIN

Launch it. Keep earning from it.
```

**Indonesian**

```
CLAYSPAD
SEGERA DI ROBINHOOD CHAIN

Launch sekali, dapat terus.
```

---

## How to set it

**Colour.** `CLAYSPAD` in off-white `#F2F5F4`, or split it the way your earlier
reference did — `CLAY` in off-white, `SPAD` in `#8D949C`. The kicker line under
it in `#8D949C`, small and letterspaced. The headline in off-white.

**Only one thing on the whole banner glows green `#3FE08A`**, and it should be
the kicker line, never the headline. The portal in the art is already the
brightest thing in the frame; two competing glows flattens both.

**Placement.** Vertically centred in the left half, at least 60 px clear of the
left edge at 1500 px wide. **Not near the bottom** — on X the profile picture
covers the bottom-left corner on every client, and a headline placed there is a
headline nobody reads.

**Hierarchy.** Wordmark largest, kicker smallest, headline between the two. Three
lines and no more. The empty space under them is not a gap to fill; the art is
doing the rest of the work.

## The rule: no figures outside the contracts

The supply, the share that goes into the pool, the share that stays liquid, the
swap fee, the creator's cut, the opening market cap and the top of the range are
**constants in `Clayspad.sol` and `ClayHook.sol`, and that is the only place
they are published.** Not on the banner, not in a post, not on the site.

It is a coherent position and worth stating plainly: the contract is the
specification, and marketing does not get to restate a specification in its own
words. Anything restated can drift from the code, gets screenshotted, and
outlives the version it was true for. A reader who wants the numbers reads them
from the source that enforces them.

Two consequences to be aware of rather than to work around:

- **The copy cannot make the disclosure either.** The share of every supply that
  stays liquid is the single most material thing a buyer needs to know, and with
  this rule it is not in the bio, the posts or the banner. It has to stay easy to
  find somewhere public — right now that is `clayspad/README.md` and
  `contracts/README.md`, both of which state it in full. Keep it that way.
- **"Most of the supply" is the strongest claim the copy can make**, and it is
  still true. Do not let it slide into "the whole supply" or "all of it", which
  would be false and is the exact shape of mistake this rule exists to prevent.

## No domain and no handle

Neither goes on the banner until both are registered. Hoodpad shipped a banner
printing `HOODPAD.FUN` and `@HOODPAD` when neither was — that is why this is a
rule here rather than a preference.

## A note on the ratio

This render is **16:9**. That is the right shape for a website header or a link
preview, and the wrong one for an X header, which is **3:1** (1500 × 500) and
would crop the top and bottom off the platform.

If it is going on X as well, generate that one with prompt 3 in
[`PROMPTS.md`](PROMPTS.md), which is composed for the shape. The copy above fits
either without changes — it is three lines in both.
