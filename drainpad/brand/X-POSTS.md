# Drainpad — posts

English, because that is the language this account writes in.

**No numbers in any of them.** No supply, no fee, no split, no market cap. Those
are constants in contracts that are verified with their source published, and a
post cannot be checked against the chain. Every post that would want a figure
points at the explorer instead and lets the reader read it at the source.

**Every post ends with the deployer address.** Last line, on its own, nothing
after it.

```
0xC064C11de4ED1e61B97F438FC0e1487E34eD8baD
```

---

## 1 · The launch announcement

Post this first, with `out/post-launch-1200x675.jpg`. Pin it.

```
Drainpad is live on Robinhood Chain.

Water finds the lowest point and stays there. That is the whole idea, and it is
the whole design.

One transaction mints a token, opens its pool, and sends the pool's share down
into a contract that has no function to pump any of it back out. Not a timelock.
Not a promise. No function.

drainpad.fun

Deployer: 0xC064C11de4ED1e61B97F438FC0e1487E34eD8baD
```

## 2 · The addresses

**Only after the announcement is up**, and only with the addresses checked
against the chain first. An address in a post is the one thing a reader cannot
verify by reading the post.

```
Three contracts, verified, source published under MIT:

Drainpad · 0x424aeEf840B9C4E4dCC63B949186d59Eb1C8068b
Grate · 0xa28e1f5A414aE7C22f17D593e675ff6E44d360Cc
Sump · 0x1cF1374612F0539A31670751BaD0867C3a330F46

The supply, the split and what the grate keeps are constants in there. Read them
at the source rather than taking a post's word for it.

Deployer: 0xC064C11de4ED1e61B97F438FC0e1487E34eD8baD
```

## 3 · The sump

With `out/post-sump-1200x675.jpg`.

```
The contract holding every launch's liquidity is called Sump.

Search it for a negative liquidity delta.

There is not one. Liquidity leaves a Uniswap v4 pool through exactly one door,
and that door is not in this contract. No withdraw, no owner, no pause, no
emergency hatch, no upgrade path.

A position is not an NFT either. There is no object to sell, lend against, or
approve away by accident.

Deployer: 0xC064C11de4ED1e61B97F438FC0e1487E34eD8baD
```

## 4 · The grate

With `out/post-grate-1200x675.jpg`.

```
Nothing enters a drain without crossing the grate, and the grate keeps a share
of whatever crosses it.

Both directions. Buy with ETH and it is kept in ETH; sell the token back and it
is kept in the token. Split between whoever launched it and the treasury, with
no setter on either side.

A pool's hook is part of its key, so the rate is fixed the moment the pool opens.
Not governed. Not timelocked. A different hook would be a different pool.

Deployer: 0xC064C11de4ED1e61B97F438FC0e1487E34eD8baD
```

## 5 · The honest part

No image. This one is better plain.

```
The part of this that is not locked:

Some of every supply is minted straight to a wallet the creator nominates, and
it is liquid from the first block. Not vested, not cliffed, not locked. No
contract here restrains it and none of them pretends to.

That is the cost of the design, and it is written into the launchpad as a
constant rather than left to a setting — so it is the same for everyone, and
there is one thing to check instead of one per token.

Whoever holds that wallet can sell into any bid that appears. Our job is not to
stop them. It is to make sure nobody had to guess.

Deployer: 0xC064C11de4ED1e61B97F438FC0e1487E34eD8baD
```

## 6 · The token, once it is launched

The token's own address goes in the gap. It does not exist until the launch, so
it is filled in from the receipt rather than typed ahead of time.

```
$DRAIN is live.

Minted, pooled and sunk in one transaction, through the same launchpad anybody
else can use. Nothing about it was done by hand and nothing about it can be
undone.

<token address>

Read the contract before you read anything anyone says about it — including
this.

drainpad.fun

Deployer: 0xC064C11de4ED1e61B97F438FC0e1487E34eD8baD
```

## Replies worth having ready

```
It is a launchpad. You launch the token, the pool opens in the same transaction,
and the pool's share goes into a contract with no way to take it back out. The
source is verified — read it rather than this.
```

```
No presale, no allocation to us, no posting fee. It costs gas.
```

```
The rate is a constant in the hook, and a pool's hook is part of its key. It
cannot be changed after the pool opens. That is not a policy, it is the shape of
Uniswap v4.
```
