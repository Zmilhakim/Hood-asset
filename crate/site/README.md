# CRATE — the site

The page people buy on. Next.js, wagmi, and nothing else to sign up for.

```bash
npm install
npm run dev        # http://localhost:3000
npm run build
npm run typecheck
npm run lint
```

## It tells the truth about whether there is anything to buy

`NEXT_PUBLIC_TOKEN_ADDRESS` and `NEXT_PUBLIC_ROUTER_ADDRESS` are both optional.
Without them the page renders a panel saying the crate is not packed yet, rather
than a swap box that could only fail. Set them after `npm run pack` and
`npm run deploy-router` in `../contracts`, and the same page becomes a working
one. Every figure it then shows is read from the pool manager — none of it is
estimated here.

## How a trade actually happens

A v4 pool cannot be called directly: every pool is inside one manager, and
reaching it means unlocking that manager and being called back, which a wallet
cannot do. So the page trades through `CrateRouter`, which can only reach the
one pool CRATE was packed into.

Quotes come from Uniswap's own `V4Quoter` rather than from arithmetic here. It
is not a view function, but `eth_call` runs it happily, and it walks the same
tick math the swap will — so the number on screen is the number the pool would
give, not an approximation of it.

Every trade carries a minimum output and a twenty-minute deadline. Below the
minimum, or after the deadline, the router reverts instead of filling. The
default slippage is 2%, which is a young pool's reality rather than a
suggestion.

Selling needs an ordinary ERC20 approval first; the page asks for exactly the
amount being sold rather than an unlimited one. Buying needs no approval at all,
because ETH rides along with the call.

## ABIs are generated, not copied

`src/lib/abi/` is written by `../contracts/compile.mjs`. Nothing there is edited
by hand, so the frontend cannot drift from the contracts it is calling — change
a signature and the build breaks here rather than the button failing in
somebody's wallet.

## Deploying

Vercel, with `NEXT_PUBLIC_*` set in the project. `vercel.json` pins the Next.js
preset. The custom domain is `cratecoin.fun`.
