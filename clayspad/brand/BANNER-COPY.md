# Clayspad — banner copy

The text that goes on the empty left side of the banner, set in an editor after
the art comes back from Google Flow.

**No figures anywhere in here.** Not the supply, not the split, not the fee, not
a market cap. Those live in the contracts and nowhere else — see
[the rule](#the-rule-no-figures-outside-the-contracts) at the bottom.

**The account is written in English**, as a standing rule, so there is one
version of each option rather than two. Pick an option and stay with it.

Every line below is 34 characters or shorter. A banner is read at thumbnail size
more often than at full size, and a line that wraps on a phone stops being a
headline and becomes a paragraph.

---

## The header

One option, not three. The header sits there for months, so it says what
Clayspad **is** rather than announcing anything — a banner naming a launch is
stale the week after it happens.

```
CLAYSPAD
A LAUNCHPAD ON ROBINHOOD CHAIN

Fired once, and for good.
```

The kicker says where it lives; the line says what the place does to what you
put in it. Neither sentence appears anywhere else on the account — the bio is
plain words with no metaphor, the launch image is three words about the moment,
and the kiln line belongs to the site where there is room to explain it. See
[`VOICE-MAP.md`](VOICE-MAP.md).

### If the account is not launched yet

Swap the kicker for `LAUNCHING ON ROBINHOOD CHAIN` until it is, then put it
back. The headline does not change.

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

- **The copy cannot state the figure.** The share of every supply that stays
  liquid is the single most material thing a buyer needs to know, so it has to be
  easy to find somewhere public. It is: **clayspad.fun says it in words** on the
  front page and on `/learn` — liquid from the first block, not vested, not
  cliffed, not locked — without printing the percentage, which lives in
  `Clayspad.sol` where it is enforced. Do not let a redesign quietly drop it.
- **"Most of the supply" is the strongest claim the copy can make**, and it is
  still true. Do not let it slide into "the whole supply" or "all of it", which
  would be false and is the exact shape of mistake this rule exists to prevent.

## The domain may go on it, the handle may not

`clayspad.fun` is registered and live, so it can go on the banner. **The handle
is not registered yet**, so it must not — come back and change this line once it
is. Hoodpad shipped a banner printing `HOODPAD.FUN` and `@HOODPAD` when neither
was, which is why this is a rule here rather than a preference.

## A note on the ratio

This render is **16:9**. That is the right shape for a website header or a link
preview, and the wrong one for an X header, which is **3:1** (1500 × 500) and
would crop the top and bottom off the platform.

If it is going on X as well, generate that one with prompt 3 in
[`PROMPTS.md`](PROMPTS.md), which is composed for the shape. The copy above fits
either ratio without changes — it is three lines either way.
