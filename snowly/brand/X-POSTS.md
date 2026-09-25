# Snowly — posts

English, because that is the language this account writes in.

**No numbers in any of these.** No supply, no fee, no market cap, no split. They
are constants in a contract that is verified with its source published, and a
post cannot be checked against the chain. Every post that needs a figure links
to the explorer instead and lets the reader read it at the source.

---

## The launch announcement

Post this first, with `brand/out/post-launch.jpg`.

```
Snowly is live on Robinhood Chain.

Fresh snow is loose. It drifts, it packs down, the wind moves it somewhere else.

Bury it deep enough and it stops being snow at all — the flakes fuse under their
own weight into ice, and no thaw short of melting the whole glacier gives them
back.

That is the shape of this launchpad.

snowly.fun

Deployer: 0xd1191cd18b45dF695F040f7988D54a09d0592d24
```

## The follow-up, with the addresses

**Only after the announcement is up**, and only with addresses checked against
the chain first. An address in a post is the one thing a reader cannot verify by
reading the post.

```
The three contracts, verified, source published under MIT:

Launchpad · 0x0D4841BA415b329Fc24f8De3464D430d2C393890
Fee hook · 0xAEE7acF3d68a88C35e2d97743fa8f3742f8ae0Cc
Glacier · 0x41d7B78cB5Cfce16509D4B8fFf0e572EC43a7C7A

The supply, the split and the fee are constants in there. Read them at the
source rather than taking a post's word for it.

Deployer: 0xd1191cd18b45dF695F040f7988D54a09d0592d24
```

## On the glacier

```
The contract holding every launch's liquidity is called Glacier.

Search it for a negative liquidity delta.

There is not one. No withdraw, no owner, no pause, no emergency hatch, no
upgrade path. What goes in is a position the contract has no function to take
back out.
```

## On what a launch actually is

```
A launch on Snowly is one transaction.

The token is deployed and its supply is split in its own constructor. A pool
opens against native ETH. The pool's share goes in as a single position.

Everything about a token is loose right up until that transaction. One of the
two things it does cannot be undone.
```

## On the part that is not locked

Post this. A launchpad that only advertises its locked side is describing half
of itself, and the half it leaves out is the half a buyer gets hurt by.

```
The share that does not go into the pool is minted straight to a wallet the
creator names, and it is liquid from the first block.

Not vested. Not cliffed. Not locked. The token contract has no machinery for any
of that and Snowly does not pretend otherwise.

Whoever holds that wallet can sell into any bid that appears. Read the split in
the contract before you buy, not after.
```

## On the fee living in the pool's key

```
A Uniswap v4 pool's hook is part of its key.

Which means the fee a Snowly pool charges is decided when the pool is opened,
and cannot be raised or switched off afterwards. Not by governance, not by a
timelock, not by us.

A different hook is not this pool with a different rate. It is a different pool.
```

## On the hook's address being mined for

For the readers who like the mechanism.

```
A v4 pool works out which callbacks to make by reading the low bits of its
hook's address. The permissions are the address.

So the hook cannot be deployed wherever it lands. Its address is mined for with
CREATE2, and the hook's own constructor checks the result and reverts if the
bits are wrong.

A mis-mined salt costs a failed deployment — not a launchpad whose fee is
quietly never charged.
```

## On verification

```
All three contracts are verified with their source published under MIT.

Not because it is a nice gesture. Because every claim this account makes about
what they do is checkable against them, and a claim nobody can check is worth
nothing.
```

## Replies worth having ready

**"Is it audited?"**

```
No. It has not been audited and nothing here says otherwise.

What it has is published source under MIT, a test suite that launches a token
and trades against it on a local EVM using Uniswap's own PoolManager, and
contracts with no owner, no pause and no upgrade path. Read them yourself.
```

**"What stops the team rugging?"**

```
The pool's share sits in a contract with no withdraw function, no owner and no
upgrade path. That part cannot be pulled.

The share that is minted to the supply wallet is liquid from the first block and
nothing restrains it. That part can be sold at any time. Both of those are true
and the second one is in the contract for anyone to read.
```

**"When token?"**

```
The launchpad is live now. Anyone can launch through it — it costs nothing but
gas.

snowly.fun/launch
```

---

## The deployer address

```
0xd1191cd18b45dF695F040f7988D54a09d0592d24
```

It closes the launch announcement and the contracts post. It is the address that
deployed the launchpad, and the launchpad deployed the hook and the glacier in
its own constructor — so all three trace back to this one address, and the
explorer already shows it as the launchpad's creator. Putting it in the post
reveals nothing that is not on chain; it saves a reader the lookup and lets them
tie the contracts to a single origin without trusting the post to have listed
them all.

Keep it as the last line, on its own, with a blank line above it. It is a thing
to check, not part of the sentence before it.

Add it to the other posts only if they are being used as a first introduction.
On a short post about the mechanism it reads as a signature nobody asked for.

---

## Before any of these goes out

1. Check every address against the chain, not against this file. `npm run
   status` in `contracts/` prints what the launchpad and the pool manager
   actually say, and the deployer is the creator recorded on each contract's
   page on the explorer.
2. Read the wordmark in the image letter by letter. Generators misspell it.
3. Confirm there is no number in the post that belongs in the contract.
