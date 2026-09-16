# CRATE

One crate on Robinhood Chain. Packed once, sealed once. Nobody opens it.

- X: [@cratecoinxyz](https://x.com/cratecoinxyz)
- Site: [cratecoin.fun](https://cratecoin.fun)

```
contracts/   the token, the pool it opens, and the seal that holds it shut
```

$CRATE is one fixed supply of 1,000,000,000, minted and put into a single
Uniswap v3 position in one transaction, with the position handed to a contract
that has no way to give it back. Trading fees are not paid out to anyone: the
only thing that can be done with them is to put them back into the same
position, and anybody may pay the gas to do it.

Start with [`contracts/README.md`](contracts/README.md) for the mechanism and
what it does not promise.

> Not audited, and not deployed. Nothing in here claims otherwise.
