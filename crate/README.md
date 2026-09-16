# CRATE

One crate on Robinhood Chain. Packed once, sealed once. Nobody opens it.

- X: [@cratecoinxyz](https://x.com/cratecoinxyz)
- Site: [cratecoin.fun](https://cratecoin.fun)

```
contracts/   the token, the Uniswap v4 pool it opens, and the seal that holds it shut
```

$CRATE is one fixed supply of 1,000,000,000, minted and put into a single
Uniswap v4 position against native ETH in one transaction. In v4 that position
is not an NFT — it is a row in the pool manager belonging to the contract that
added it — so there is nothing to transfer, sell or approve away, and the only
contract that could shrink it has no code that does.

Trading fees are not paid out to anyone. The only thing that can be done with
them is to put them back into the same position, and anybody may pay the gas to
do it.

Start with [`contracts/README.md`](contracts/README.md) for the mechanism and
what it does not promise.

> Not audited, and not deployed. Nothing in here claims otherwise.
