# CRATE

One crate on Robinhood Chain. Packed once, sealed once. Nobody opens it.

- X: [@cratecoinxyz](https://x.com/cratecoinxyz)
- Site: [cratecoin.fun](https://cratecoin.fun)

```
contracts/   the token, the Uniswap v4 pool it opens, and the seal that holds it shut
site/        the page people buy on
```

$CRATE is one fixed supply of 1,000,000,000, minted and put into a single
Uniswap v4 position against native ETH in one transaction. In v4 that position
is not an NFT — it is a row in the pool manager belonging to the contract that
added it — so there is nothing to transfer, sell or approve away, and the only
contract that could shrink it has no code that does. Nothing is held back: no
supply for the team, no owner, no second launch.

The pool's trading fees go to one address, fixed in the seal when it was
deployed and unchangeable afterwards. The liquidity does not: what anyone pays
for supply stays in the pool, permanently, and no address can withdraw it.

Start with [`contracts/README.md`](contracts/README.md) for the mechanism and
what it does not promise, and [`site/README.md`](site/README.md) for the page
itself. The site says so honestly when there is nothing to buy yet, rather than
showing a swap box that could only fail.

> Not audited, and not deployed. Nothing in here claims otherwise.
