# Drainpad — deploying and launching, step by step

Nothing is on chain yet. This is the order to do it in.

The shell opens in Termux, not in Ubuntu, so the first step of any session is
`proot-distro login ubuntu` on its own. Every command below then carries its own
`cd`, because a fresh paste starts wherever the shell happens to be:

```bash
proot-distro login ubuntu
```

## Before anything

Both the deploy and a launch need `DEPLOYER_KEY` in the environment. Read it in
so it is never echoed to the screen and never enters the shell history:

```bash
cd /root/Hood-asset/drainpad/contracts && read -s -p "private key: " DEPLOYER_KEY && export DEPLOYER_KEY && echo
```

Nothing appears while you paste. That is the point, not a hang.

When you are finished for the session:

```bash
unset DEPLOYER_KEY
```

The key belongs to `0xC064C11de4ED1e61B97F438FC0e1487E34eD8baD`. The scripts
check that and stop if a different key is loaded, before anything is sent.

## 1. Deploy the launchpad

This puts three contracts on chain in one transaction — the launchpad, the fee
grate and the sump — and launches no tokens.

```bash
cd /root/Hood-asset/drainpad/contracts && npm run deploy
```

It mines the grate's salt itself, prints the deployer, the balance, the treasury
and the three addresses, and then reads all of them back off the chain before it
says it worked. The salt is written into `drainpad.config.json`, because the
launchpad cannot be verified later without it.

Mined against nonce 0, the addresses come out as:

| | |
| --- | --- |
| launchpad | `0x424aeEf840B9C4E4dCC63B949186d59Eb1C8068b` |
| grate | `0xa28e1f5A414aE7C22f17D593e675ff6E44d360Cc` |
| sump | `0x1cF1374612F0539A31670751BaD0867C3a330F46` |

They hold only if the deploy is the next transaction that address sends. Send
anything else first and `npm run deploy` mines a fresh salt for the new nonce —
the addresses change, nothing breaks.

## 2. Verify the launchpad

**Blockscout first.** The licence can only be set while a contract is being
verified, and Blockscout imports Sourcify's result automatically without one —
so verifying on Sourcify first loses the MIT label permanently.

```bash
cd /root/Hood-asset/drainpad/contracts && npm run verify:browser
```

```bash
cd /root/Hood-asset/drainpad/contracts && npm run verify:sourcify
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
0x3C38cC392A6E1f9CCb274437fa3F3d0b564c1776
```

Its private key is not in this repository and never will be. It is a throwaway:
it receives test tokens, it is never funded, and it must not be used for
anything that has value.

The deployer stays the same, because it is the address holding the gas and the
scripts check it against the config. What changes for a test is where the supply
goes, not who pays for the transaction.

Print the plan. This sends nothing:

```bash
cd /root/Hood-asset/drainpad/contracts && SUPPLY_WALLET=0x3C38cC392A6E1f9CCb274437fa3F3d0b564c1776 NAME="Drain Test" SYMBOL="TDRAIN" npm run launch
```

Read what it prints — the supply split, the wallet the liquid share goes to, the
range, and the address the token would land on. If it is right:

```bash
cd /root/Hood-asset/drainpad/contracts && SUPPLY_WALLET=0x3C38cC392A6E1f9CCb274437fa3F3d0b564c1776 NAME="Drain Test" SYMBOL="TDRAIN" CONFIRM=launch npm run launch
```

## 4. Check the test, then verify it

```bash
cd /root/Hood-asset/drainpad/contracts && npm run status
```

That reads the pool manager directly: the price, what is in the pool, and what
each wallet holds. If any of it looks wrong, stop and say so before launching
anything real. That is what the test is for.

Then publish its source:

```bash
cd /root/Hood-asset/drainpad/contracts && npm run verify:browser
```

```bash
cd /root/Hood-asset/drainpad/contracts && npm run verify:sourcify
```

`npm run verify:browser` picks up every token in the catchment on its own; there
is nothing to type in.

## 5. The real launch

Only once the test has been launched, checked and verified. Same shape, with the
real supply wallet out of `drainpad.config.json` — so no `SUPPLY_WALLET`
override this time.

```bash
cd /root/Hood-asset/drainpad/contracts && NAME="Drainpad" SYMBOL="DRAIN" npm run launch
```

Read the plan, then:

```bash
cd /root/Hood-asset/drainpad/contracts && NAME="Drainpad" SYMBOL="DRAIN" CONFIRM=launch npm run launch
```

Add `IMAGE=`, `BLURB=` and `LINK=` in front if the real token should carry them.

## 6. Verify it, then check the chain

```bash
cd /root/Hood-asset/drainpad/contracts && npm run verify:browser
```

```bash
cd /root/Hood-asset/drainpad/contracts && npm run verify:sourcify
```

```bash
cd /root/Hood-asset/drainpad/contracts && npm run status
```

An address in an announcement is the one thing a reader cannot verify by reading
the announcement, so check it here first.

## What the balance covers

At the time of writing the deployer held **0.00147241 ETH** at nonce 0. Gas on
this chain is cheap enough that the deploy and a launch together are a small
fraction of that — `npm run deploy` prints the balance before it sends anything,
and `npm run launch` simulates against the live contract before it broadcasts.
