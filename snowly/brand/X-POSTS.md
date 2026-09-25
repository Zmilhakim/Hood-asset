# Snowly — posts

English, because that is the language this account writes in.

**Every post here fits in 280 characters.** The count is the whole constraint: a
post that runs over does not get shortened by X, it does not post at all.
`./count.sh` measures every block in this file the way X does — a link counts as
23 characters whatever its real length — so a rewrite can be checked before it
is pasted rather than after it is refused.

**No numbers in any of them.** No supply, no fee, no market cap, no split. Those
are constants in verified contracts, and a post cannot be checked against the
chain. Anything that needs a figure points at the explorer instead.

---

## 1. The launch announcement

Post first, with `out/og-1200x628.jpg`. Pin it once post 2 is up.

```
Snowly is live on Robinhood Chain.

Bury snow deep enough and it fuses into ice. Nothing short of melting the glacier gives it back.

That is the shape of this launchpad.

snowly.fun
```

## 2. The contracts

**Only after post 1**, and only with the addresses checked against the chain
first. An address in a post is the one thing a reader cannot verify by reading
the post.

```
Verified, source published under MIT:

Launchpad 0x0D4841BA415b329Fc24f8De3464D430d2C393890
Hook 0xAEE7acF3d68a88C35e2d97743fa8f3742f8ae0Cc
Glacier 0x41d7B78cB5Cfce16509D4B8fFf0e572EC43a7C7A

The terms are constants in there. Read them at the source.
```

## 3. What a launch is

```
A launch on Snowly is one transaction.

The token is minted and split. A pool opens against native ETH. The pool's share goes in as one position.

Everything about a token is loose until that transaction. One of the two things it does cannot be undone.
```

## 4. The glacier

```
The contract holding every launch's liquidity is called Glacier.

Search it for a negative liquidity delta. There is not one.

No withdraw. No owner. No pause. No upgrade path.
```

## 5. The part that is not locked

Post this. A launchpad that advertises only its locked side is describing half
of itself, and the half it leaves out is the half a buyer gets hurt by.

```
The share that does not go into the pool is liquid from the first block.

Not vested. Not cliffed. Not locked. Nothing here pretends otherwise.

Read the split in the contract before you buy, not after.
```

## 6. The fee sits in the pool's key

```
A Uniswap v4 pool's hook is part of its key.

So the fee a Snowly pool charges is set when the pool opens, and cannot be raised or switched off afterwards.

Not by governance. Not by a timelock. Not by us.
```

## 7. On verification

```
All three contracts are verified, source published under MIT.

Not as a gesture. Every claim this account makes about them is checkable against them — and a claim nobody can check is worth nothing.
```

---

## Replies worth having ready

**"Is it audited?"**

```
No. It has not been audited and nothing here says otherwise.

What it has: source published under MIT, a test suite that launches and trades a token against Uniswap's own PoolManager, and contracts with no owner, no pause, no upgrade path.
```

**"What stops a rug?"**

```
The pool's share sits in a contract with no withdraw, no owner and no upgrade path. That cannot be pulled.

The share minted to the supply wallet is liquid from the first block. That can be sold at any time.

Both are true. Both are in the contract.
```

**"When token?"**

```
The launchpad is live now. Anyone can launch through it — it costs nothing but gas.

snowly.fun/launch
```

---

## Before any of these goes out

1. `./count.sh` — nothing over 280.
2. Check every address against the chain, not against this file. `npm run
   status` in `contracts/` prints what the launchpad actually says.
3. Read the wordmark in the image letter by letter. Generators misspell it.
4. Confirm no number in the post belongs in the contract instead.
