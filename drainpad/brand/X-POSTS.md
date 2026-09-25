# Drainpad — posts

English, because that is the language this account writes in.

**Every one of these fits in 280 characters**, counted the way X counts: a link
is 23 characters whatever its real length, and everything else is one character
each. `count.mjs` does the counting, and nothing goes out of here unmeasured —
a post that has to be cut in the compose box gets cut badly.

```bash
node count.mjs posts.json
```

**No numbers in any of them.** No supply, no fee, no split, no market cap. Those
are constants in contracts that are verified with their source published, and a
post cannot be checked against the chain. Posts point at the explorer instead.

**Every post ends with the deployer address.** Last line, nothing after it.

The ticker is **$DRAIN**.

---

## 1 · The launch announcement

Post this first, with `out/post-launch-1200x675.jpg`. Pin it.

```
Drainpad is live on Robinhood Chain.

Water finds the lowest point and stays there.

One transaction mints a token, opens its pool, and drops the pool's share into a contract with no way back out.

drainpad.fun

Deployer: 0xC064C11de4ED1e61B97F438FC0e1487E34eD8baD
```

## 2 · The addresses

Only after the announcement is up, and only with the addresses checked against the chain first. An address in a post is the one thing a reader cannot verify by reading the post.

```
Three contracts, verified, source published under MIT.

Drainpad 0x424aeEf840B9C4E4dCC63B949186d59Eb1C8068b
Grate 0xa28e1f5A414aE7C22f17D593e675ff6E44d360Cc
Sump 0x1cF1374612F0539A31670751BaD0867C3a330F46

Deployer: 0xC064C11de4ED1e61B97F438FC0e1487E34eD8baD
```

## 3 · The sump

With `out/post-sump-1200x675.jpg`.

```
The contract holding every launch's liquidity is called Sump.

Search it for a way back out.

There is none. No withdraw, no owner, no pause, no emergency hatch, no upgrade path.

Deployer: 0xC064C11de4ED1e61B97F438FC0e1487E34eD8baD
```

## 4 · The grate

With `out/post-grate-1200x675.jpg`.

```
Nothing enters a drain without crossing the grate, and the grate keeps a share of whatever crosses it.

Both directions. A pool's hook is part of its key, so the rate is fixed the moment the pool opens.

Deployer: 0xC064C11de4ED1e61B97F438FC0e1487E34eD8baD
```

## 5 · The honest part

No image. This one is better plain.

```
The part that is not locked:

Some of every supply goes to a wallet the creator names, liquid from block one. Not vested, not cliffed, nothing pretends otherwise.

Not our job to stop them. Our job is that nobody guessed.

Deployer: 0xC064C11de4ED1e61B97F438FC0e1487E34eD8baD
```

## 6 · The token, once it is launched

With `out/post-token-1200x675.jpg`. The zero address below is a placeholder for the real one, which does not exist until the launch — it is filled in from the receipt rather than typed ahead of time. It is the same length, so the count already accounts for it.

```
$DRAIN is live.

Minted, pooled and sunk in one transaction, through the same launchpad anyone else can use.

0x0000000000000000000000000000000000000000

Read the contract before anything said about it, this included.

Deployer: 0xC064C11de4ED1e61B97F438FC0e1487E34eD8baD
```

## Replies worth having ready

```
It is a launchpad. You launch the token, the pool opens in the same transaction, and the pool's share goes into a contract with no way to take it back out. The source is verified — read it rather than this.
```

```
No presale, no allocation to us, no posting fee. It costs gas.
```

```
The rate is a constant in the hook, and a pool's hook is part of its key. It cannot change after the pool opens. That is not a policy, it is the shape of Uniswap v4.
```
