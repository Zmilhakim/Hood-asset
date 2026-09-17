# CRATE — the dock

The page people buy on. It keeps the look of the static page it replaces — pine
boards, steel strapping, a manila tag with a red stamp — and changes what is
underneath.

Two things moved. The figures used to come from DexScreener, which means waiting
for an indexer to notice a brand-new v4 pool on a young chain and showing
"not listed yet" until it does; they now come out of Uniswap's pool manager, so
they are right in the block the pool is created. And "Buy $CRATE" used to be a
link somewhere else; it is now a till on the page, trading against the pool
through `CrateRouter`.

The one panel still fed by an indexer is the shipment log, because an event
history is a bad fit for a browser over a public RPC. The page says so rather
than blurring the difference: figures from the chain, history from Blockscout.

```bash
npm install
npm run dev        # http://localhost:3000
npm run build
npm run typecheck
npm run lint
```

## It tells the truth about whether there is anything to buy

The crate is packed, so the token, router and packer addresses live in
`src/lib/addresses.ts` — the same file as the fee tier, and as permanent. The
page therefore trades by default, and every figure on it is read from the pool
manager rather than estimated here.

They were build-time variables until the launch, and that was the right shape
while the addresses did not exist yet. It is the wrong shape afterwards: a
deployment that forgets a variable does not fail, it builds a page telling
visitors the token does not exist. The variables still override the file, for a
fork or a test chain, and `NEXT_PUBLIC_TOKEN_ADDRESS=none` is how the
pre-launch panel is asked for deliberately.

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

## Where the ETH figure comes from

"ETH sealed in" is not an abstract liquidity number. `lib/ticks.ts` is Uniswap's
TickMath transliterated — the same code as `contracts/lib/ticks.mjs`, which is
tested against the constants Uniswap publishes — and it turns the position's
liquidity and tick bounds into the actual ETH sitting inside the crate at the
current price. Above the range that is zero, which is the honest answer before
anybody has bought.

## ABIs are generated, not copied

`src/lib/abi/` is written by `../contracts/compile.mjs`. Nothing there is edited
by hand, so the frontend cannot drift from the contracts it is calling — change
a signature and the build breaks here rather than the button failing in
somebody's wallet.

## Deploying

Vercel, project `cratecoin`, serving `cratecoin.fun`.

The repository holds several projects, so the Vercel project's **Root Directory
must be `crate/site`** — it is a dashboard setting with no API, and without it
the build starts at the repository root, finds no `package.json`, and fails.
`vercel.json` inside this directory pins the Next.js preset, so nothing else
needs setting by hand.

No environment variables are needed. The addresses are in the repository, so a
fresh clone deploys a working page and a forgotten dashboard setting cannot
produce one that says the token was never launched.

Production builds from `main`. Vercel skips a build when a commit touches
nothing under the Root Directory, so a contracts-only commit will not appear
here — that is expected, not a broken hook.
