# $CRATE — launch copy

Everything to post, in the order it goes out. Character counts are measured by
`node count.mjs`, not estimated: X counts Unicode code points rather than bytes,
counts any link as 23 characters however long it is, and the free limit is 280.

Every fenced block is the post exactly as it should be sent. The line breaks in
them are deliberate — blank lines between paragraphs, and nothing wrapped to fit
this file. A break in the middle of a sentence reads on X as a break somebody
meant, which is why the blocks run past 80 columns and the prose around them
does not.

The address in the copy below is the real one, taken from the pack receipt and
recorded in `../contracts/crate.config.json`. Copy it from here rather than
retyping it: a CA one character out is a different token, and on a launch post
that is the mistake that cannot be taken back.

    CA     0x1be2723C92F0ead9f2494C6D211aA33D4551326C
    seal   0xfbBEE6923f4EF4F324b36673167e136c1Fbc3ebc

## Before posting

- `npm run verify` — `CrateSeal` has to be verified. It is the contract the
  whole claim rests on, and the launch post invites people to go and read it.
  `CrateSeal` and `CratePacker` are verified; `CrateToken` and `CrateRouter` are
  not yet, which rules out exactly one alternative below, marked where it sits.
- `npm run status` — confirms the pool is priced, and says whether anyone has
  bought. Nobody having bought yet is the normal state and is not a reason to
  wait: it is what the post is for.
- Open `cratecoin.fun` once, first. X scrapes the link the moment the post is
  sent and never again, so a page that is broken at that moment is a broken
  card for the life of the post.

---

## 1. The launch post

The one that gets pinned and linked. Post it **after** `npm run verify`, so the
first person who checks the contract can read it.

**Pick this** —

```
$CRATE is packed.

1,000,000,000 tokens. All of it into one pool on Robinhood Chain.

The liquidity cannot be withdrawn. Not by anyone, including me — there is no function that does it.

CA: 0x1be2723C92F0ead9f2494C6D211aA33D4551326C

cratecoin.fun
```

Alternatives —

```
One crate on Robinhood Chain.

The whole supply went into one pool. The pool cannot be drained. Nothing was held back for a team.

Packed once, sealed once. Nobody opens it.

CA: 0x1be2723C92F0ead9f2494C6D211aA33D4551326C
```

Hold this one back until `CrateToken` verifies. It invites people to read the
token contract, and an unverified contract answers that invitation with
bytecode — which reads as the claim failing its first check.

```
$CRATE. 1B supply, all of it in the pool, none of it in my wallet.

The contract has no mint, no owner, no pause, and no way to pull the liquidity. Read it yourself — the source is verified.

CA: 0x1be2723C92F0ead9f2494C6D211aA33D4551326C

cratecoin.fun
```

---

## 2. The thread

Post as a reply chain under the launch post. Each one stands on its own, so a
screenshot of any single post is not misleading.

**1/**
```
Most launches say "liquidity locked" and mean a timer, or a multisig, or a promise.

$CRATE means there is no function that removes it. Not locked. Absent.
```

**2/**
```
It runs on Uniswap v4, where a liquidity position is not an NFT — it is a row in the pool manager belonging to the contract that added it.

So there is nothing to transfer, sell, borrow against, or approve away by mistake. There is no object.
```

**3/**
```
The contract that owns it has no function that decreases liquidity. Every liquidity change in the file is zero or positive.

That is the whole claim, and it is one search away from being checked.
```

**4/**
```
What I earn: the pool's 1% trading fee, paid to one address fixed inside the contract before the token existed. There is no function that changes it.

What I don't: no team allocation, no reserve, no unlock later. The supply went in whole.
```

**5/**
```
What this does not promise:

Locked liquidity is not a price floor. It means the money paid for supply stays in the pool — not that the price can't fall.

The contracts are not audited. It can go to zero.
```

**6/**
```
Buy and sell on the dock, straight against the pool. Every figure on the page is read from the pool manager, not from an indexer.

cratecoin.fun
```

---

## 3. The pinned post

Pin the launch post. If you would rather pin something that stays true as the
price moves —

```
$CRATE

One crate on Robinhood Chain. 1B supply, all of it in one pool, and no function anywhere that takes it back out.

CA: 0x1be2723C92F0ead9f2494C6D211aA33D4551326C

cratecoin.fun
```

---

## 4. Replies worth having ready

**"is the liquidity locked?"**
```
Stronger than locked — there is no function to remove it. Not a timer, not a multisig. The contract that owns the position has no code that decreases it.

Verified source, read it:
robinhoodchain.blockscout.com/address/0xfbBEE6923f4EF4F324b36673167e136c1Fbc3ebc
```

**"what's your allocation?"**
```
None. The supply was minted straight into the pool in the same transaction — it never sat in a wallet.

I earn the 1% trading fee, paid to an address fixed in the contract. That is all of it.
```

**"why isn't it on DexScreener?"**
```
It's a Uniswap v4 pool, and v4 indexing on this chain is newer than v3.

cratecoin.fun reads the pool manager directly, so the price there is right whether or not an indexer has caught up.
```

**"is this Robinhood's token?"**
```
No. Robinhood Chain is run by Robinhood. $CRATE is not made, checked, or backed by them, and nothing here should be read as if it were.
```

---

## 5. What not to say

Nothing in this file promises a price, a floor, a return, or a listing. That is
deliberate, and it is worth keeping that way when replying at speed:

- **Not** "can't go down", "guaranteed", "safest launch". Locked liquidity is
  not a floor and saying so is simply false.
- **Not** "audited". It is not.
- **Not** anything that reads as Robinhood endorsing it.
- **Not** a CA typed from memory. Copy it.

The pitch is that every claim can be checked. One claim that cannot be is worth
more damage than the post is worth.

---

## 6. Images

`og.png` is attached automatically when `cratecoin.fun` is in the post — X
scrapes the link once, when the post is made, so the card cannot be added
afterwards. Check the preview renders before sending.

For a post without the link, attach `../site/public/og.png` by hand.

`out/post-seal.png` lists every external function `CrateSeal` has, taken from
the compiled contract rather than typed out, under an instruction to find the
one that removes liquidity. It belongs under thread post **3/**, which makes
that claim in words.

`out/post-supply.png` is where the supply went: 100% into the pool, nothing to a
team, nothing reserved, nothing unlocking later. It belongs under **4/**.

Both are regenerated by `node render.mjs`, which reads the seal's ABI out of
`../contracts/out` — so the list on the card cannot drift from the contract.
