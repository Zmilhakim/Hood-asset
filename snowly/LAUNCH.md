# Snowly — deploying and launching, step by step

Nothing is on chain yet. This is the order to do it in, and every command runs
from `/root/Hood-asset/snowly/contracts`.

## Before anything

Both the deploy and a launch need `DEPLOYER_KEY` in the environment. Read it in
so it is never echoed to the screen and never enters the shell history:

```bash
read -s -p "private key: " DEPLOYER_KEY && export DEPLOYER_KEY && echo
```

Nothing appears while you paste. That is the point, not a hang.

When you are finished for the session:

```bash
unset DEPLOYER_KEY
```

The key belongs to `0xd1191cd18b45dF695F040f7988D54a09d0592d24`. The scripts
check that and stop if a different key is loaded, before anything is sent.

## 1. Deploy the launchpad

This puts three contracts on chain in one transaction — the launchpad, the fee
hook and the glacier — and launches no tokens.

```bash
npm run deploy
```

It mines the hook's salt itself, prints the deployer, the balance, the treasury
and the three addresses, and then reads all of them back off the chain before
it says it worked. The salt is written into `snowly.config.json`, because the
launchpad cannot be verified later without it.

## 2. Verify the launchpad

**Blockscout first.** The licence can only be set while a contract is being
verified, and Blockscout imports Sourcify's result automatically without one —
so verifying on Sourcify first loses the MIT label permanently.

```bash
npm run verify:browser
npm run verify:sourcify
```

Neither sends a transaction and neither needs a key. The first runs a real
browser, because this chain's explorer sits behind Cloudflare and answers 403 to
a plain request — see `contracts/README.md` for why the cookie alone is not
enough.

## 3. The test launch

**Always before the real one.** A launch cannot be undone: the token is recorded
on the launchpad forever and shows on the site, so a wrong figure or a failed
attempt belongs on a token whose name already says it is not the real thing.

Two rules for it:

**No metadata.** `IMAGE`, `BLURB` and `LINK` default to empty, so leaving them
out is the whole of it. A test token should carry nothing that makes it look
like a launch anybody was meant to buy.

**A separate supply wallet.** Never the real token's wallet — a test balance and
a real one should not land in the same place. The wallet below exists only for
this and holds nothing else:

```
0x00a80bd955AB8117A68710BE855B23A72b2e7F78
```

Its private key is not in this repository and never will be. It is a throwaway:
it receives test tokens, it is never funded, and it must not be used for
anything that has value.

The deployer stays the same, because it is the address holding gas and the
scripts check it against the config. What changes for a test is where the supply
goes, not who pays for the transaction.

Print the plan. This sends nothing:

```bash
SUPPLY_WALLET=0x00a80bd955AB8117A68710BE855B23A72b2e7F78 NAME="Snowly Test" SYMBOL="TSNOW" npm run launch
```

Read what it prints — the supply split, the wallet the liquid share goes to, the
range, and the address the token would land on. If it is right:

```bash
SUPPLY_WALLET=0x00a80bd955AB8117A68710BE855B23A72b2e7F78 NAME="Snowly Test" SYMBOL="TSNOW" CONFIRM=launch npm run launch
```

## 4. Check the test, then verify it

Open [snowly.fun/snowfield](https://snowly.fun/snowfield). The test token should
appear, and its own page should show a price and what is in the pool — all read
live from the chain. If any of it looks wrong, stop and say so before launching
anything real. That is what the test is for.

Then publish its source:

```bash
npm run verify:browser
npm run verify:sourcify
```

`npm run verify:browser` picks up every token on the snowfield on its own; there
is nothing to type in.

## 5. The real launch

Only once the test has been launched, checked on the site and verified. Same
shape, with the real supply wallet out of `snowly.config.json` — so no
`SUPPLY_WALLET` override this time.

```bash
NAME="Snowly" SYMBOL="SNOW" npm run launch
```

Read the plan, then:

```bash
NAME="Snowly" SYMBOL="SNOW" CONFIRM=launch npm run launch
```

Add `IMAGE=`, `BLURB=` and `LINK=` in front if the real token should carry them.

## 6. Verify it, then check the chain

```bash
npm run verify:browser
npm run verify:sourcify
npm run status
```

`npm run status` reads the pool manager directly: the price, what is in the
pool, and what each wallet holds. An address in an announcement is the one thing
a reader cannot verify by reading the announcement, so check it here first.

## What the balance covers

At the time of writing the deployer held **0.00204631 ETH** at nonce 0. Gas on
this chain is cheap enough that the deploy and a launch together are a small
fraction of that — `npm run deploy` prints the balance before it sends anything,
and `npm run launch` simulates against the live contract before it broadcasts.
