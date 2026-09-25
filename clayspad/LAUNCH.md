# Clayspad — launching, step by step

The launchpad is deployed and verified. Nothing has been launched through it
yet, so `pieceCount` is zero and the shelf on clayspad.fun is empty because it
is empty.

This is the order to do it in. Every command runs inside the PRoot distro
(`proot-distro login ubuntu`), from `/root/Hood-asset/clayspad/contracts`.

## Before anything

A launch needs `DEPLOYER_KEY` in the environment. Read it in so it is never
echoed to the screen and never enters the shell history:

```bash
read -s -p "private key: " DEPLOYER_KEY && export DEPLOYER_KEY && echo
```

Nothing appears while you paste. That is the point, not a hang.

When you are finished for the session:

```bash
unset DEPLOYER_KEY
```

The key belongs to `0xBF9a58Ca76739d815d8F2c6D54538E77A0a27485`. The scripts
check that and stop if a different key is loaded, before anything is sent.

## The test launch already happened

`Clayspad Test` (`$CTEST`) went out on 2026-09-25 as piece #0, from a throwaway
wallet, with no metadata. It is at
`0xE91E3c630Ff6c43E328d2bC83690d8A96c6306bb`, verified on Blockscout with the
MIT licence and on Sourcify at `exact_match`.

What it proved, read back off the chain rather than assumed: the split landed on
exactly 750,000,000 and 250,000,000; the kiln ended with a balance of **zero**,
meaning it kept nothing back and put its whole share into the pool; one token
was burned as quantisation dust; and the site read the opening market cap back
as **1.7234 ETH** against a configured floor of 1.7 — a rounding difference, not
a factor of 10^18, which is what a mistake in the price inversion would have
produced.

The real launch is section 4. The rest of this section is kept for whenever
another test is wanted.

## 1. The test launch

Put the test wallet's address in a variable. **This is the only line to edit** —
everything after it is complete as written.

```bash
export TEST_WALLET=0x0000000000000000000000000000000000000000
```

Then print the plan. This sends nothing:

```bash
SUPPLY_WALLET=$TEST_WALLET NAME="Clayspad Test" SYMBOL="CTEST" npm run launch
```

Read what it prints: the supply split, the wallet the liquid quarter goes to,
the range, and the address the token would land on. If it is right:

```bash
SUPPLY_WALLET=$TEST_WALLET NAME="Clayspad Test" SYMBOL="CTEST" CONFIRM=launch npm run launch
```

`IMAGE`, `BLURB` and `LINK` default to empty, so the test carries no metadata
without doing anything.

**A launch cannot be undone.** The test token becomes piece #0 and stays on the
shelf, visible on the site, for as long as the launchpad exists. Name it so
nobody could mistake it for the real thing — which is what `Clayspad Test` /
`CTEST` is for.

## 2. Verify the test token

**Blockscout first.** The licence can only be set while a contract is being
verified, and Blockscout imports Sourcify's result automatically without one —
so verifying on Sourcify first loses the MIT label permanently.

```bash
npm run verify
npm run verify:sourcify
```

`npm run verify` picks up every token on the shelf on its own; there is nothing
to type in. If the explorer answers a bot challenge, the script says so rather
than reporting a failure.

## 3. Check the site

Open [clayspad.fun/shelf](https://clayspad.fun/shelf). The test token should
appear with a price, what is in the pool, and what is left — all read live.
Open its page and check the split reads the way the contract states it.

If the numbers look wrong, stop and say so before launching anything real. That
is what the test is for.

## 4. The real launch

Same shape, with the real supply wallet out of `clayspad.config.json` — so no
`SUPPLY_WALLET` override this time.

**Run this from the wallet that should own the fee.** Whoever sends the launch
transaction is recorded as the creator, and the creator's share of every swap
goes to that address for as long as the token trades. The test used a throwaway
wallet on purpose; the real one must not. That is why this step needs
`DEPLOYER_KEY` and cannot be done for you.

It will be piece #1. Piece #0 is the test, and it stays there.

```bash
NAME="Clayspad" SYMBOL="CLAY" npm run launch
```

Read the plan, then:

```bash
NAME="Clayspad" SYMBOL="CLAY" CONFIRM=launch npm run launch
```

Add `IMAGE=`, `BLURB=` and `LINK=` in front if the real token should carry them.

## 5. Verify it, then post

```bash
npm run verify
npm run verify:sourcify
```

The launch announcement is in
[`brand/X-POSTS.md`](brand/X-POSTS.md#the-launch-announcement), with
`brand/out/post-launch-en.jpg` to go with it. Post the announcement first; post
the follow-up with the token's real address **only after** the launch
transaction has confirmed, and check that address against the chain first:

```bash
npm run status
```

An address in a post is the one thing a reader cannot verify by reading the
post.

## What the balance covers

At the time of writing the deployer held **0.001954 ETH**, and a launch
simulated against the live contract at **1,280,210 gas** — about **0.000048
ETH**. That is roughly forty launches' worth of room, so gas is not the
constraint.
