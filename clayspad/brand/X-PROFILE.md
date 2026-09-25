# Clayspad — X profile kit

Everything needed to set the account up, in the fields X asks for. Character
counts were measured rather than estimated; X counts Unicode code points, and
the em dash counts as one.

**This account is written in English.** That is a standing rule across every
account, not a choice to make per post — so there is one version of each line
below rather than two.

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

```
@clayspad
```

**Registered 2026-09-25.** The short one, which is the outcome worth writing
down precisely because it usually is not: `@hoodpad` was already taken when
Hoodpad went looking, and that is the ordinary result.

It matters that this is recorded somewhere checkable. A handle somebody else
holds can be pointed at anything, and the only defence against an impersonator
is that the real one is written down where people can look it up — here, and on
the site.

## Bio — max 160

**Pick this** (151 characters):

```
A launchpad on Robinhood Chain. Most of what you launch goes into a pool nobody can drain, and every swap after that pays you for as long as it trades.
```

Plain words, no metaphor: the kiln line is on the banner and the site, and a bio
that repeats it teaches a reader nothing new. See
[`VOICE-MAP.md`](VOICE-MAP.md).

### The rest of them

| Count | Text |
| --- | --- |
| 148 | `A launchpad on Robinhood Chain. Most of what you launch goes into a pool nobody can drain. Every swap after that pays you, for as long as it trades.` |
| 137 | `Robinhood Chain. Most of what you launch goes into a pool nobody can drain, and you earn from every swap for as long as anyone trades it.` |
| 133 | `Launch a token in one transaction. The supply split, the fee and the range are constants in the contract — read them there, not here.` |

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

```
clayspad.fun
```

Registered, and the site is live on it. Put the apex in, not `www.` and not the
`.vercel.app` URL — the Vercel address works but it is the deployment's address
rather than the project's, and it stops being the one people should bookmark the
moment anything moves.

Do not put a link to an explorer page in this field: it looks like a website, it
is not one, and it goes stale the first time anything is redeployed.

## Images

You are generating these in Google Flow from [`PROMPTS.md`](PROMPTS.md). What is
worth knowing before you do:

| Field | Size | What it has to survive |
| --- | --- | --- |
| Profile picture | 1000 × 1000 | X crops it to a **circle**. Anything in the corners is gone, and anything near the edge is gone on some clients. Use prompt 1A — no wordmark, it would be cropped off. |
| Header | 1500 × 500 | Cropped differently on mobile and desktop, and the bottom-left is covered by the avatar on both. Keep that corner empty. Use prompt 3. |
| Link preview | 1200 × 630 | Goes in the OG tag once there is a site, not on the profile. Use prompt 4. |

The text that goes on the banner is in [`BANNER-COPY.md`](BANNER-COPY.md).

**Both are registered now**, so `clayspad.fun` and `@clayspad` may go on an
image. Neither has to. X already shows both in its own profile chrome, and an
image repeating them is one more thing to keep in sync — worth it on a banner
that travels off the profile, pointless on the avatar.

The rule this replaces was about publishing something before it was yours.
Hoodpad shipped a banner printing `HOODPAD.FUN` and `@HOODPAD` when neither was
registered. That is the mistake to avoid, and it no longer applies here.

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

The one consequence to stay aware of: **the copy cannot state the figure.** The
share of every supply that stays liquid is the most material thing a buyer needs
to know, so it has to be easy to find somewhere public.

It is. **clayspad.fun says it in words on two pages** — the answer to "Does all
of the supply go into the pool?" on the front page, and the section "What it
deliberately does not guarantee" on `/learn`. Both say it plainly: part of every
supply is liquid from the first block, not vested, not cliffed, not locked, and
no contract restrains it. What they do not do is print the percentage, which is
in `Clayspad.sol` where it is enforced.

That is the disclosure, and it is live. Do not let a redesign quietly drop it.

## Ticker

`$CLAY`. Not `$HOOD`, which is Robinhood's NASDAQ ticker and would read as an
official Robinhood asset to anyone skimming, and not `$PAD`, which is every
launchpad on every chain.
