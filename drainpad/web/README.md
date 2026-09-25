# Drainpad — web

The site. Next.js, wagmi and viem, and no server of its own: every figure on
every page is read out of the launchpad or the pool manager by the browser that
is showing it.

```bash
npm install
npm run abi        # regenerates the ABIs from ../contracts/out
npm run dev
npm run build
```

`npm run abi` reads `../contracts/out`, which `npm run compile` builds next
door. The ABIs are generated rather than hand-copied: one typed out by hand
drifts the first time a function is renamed, and the failure is a page that
quietly shows nothing instead of an error somebody notices.

## The figures are not here

The supply, the split, what the grate keeps and how it divides, and the range a
pool opens across do not appear anywhere on this site. They are `constant`s in
contracts that are verified with their source published, which is the copy that
binds — a second one on a web page can only go stale, be mistyped, or be read as
a promise.

That is enforced rather than remembered: `scripts/abi.mjs` leaves those getters
out of the generated ABIs, so the figures are not in the bundle at all and no
component can print one by accident. `src/lib/contracts.ts` holds the range
because a pour has to be built from it, and nothing renders it.

## Where it is deployed

Production is [drainpad.fun](https://drainpad.fun), on Vercel, with the project's
root directory set to `drainpad/web` — the repository holds several projects, so
a build that started at the repository root would find no app to build.

| Variable | What it does |
| --- | --- |
| `NEXT_PUBLIC_SITE_URL` | The origin link previews are resolved against |
| `NEXT_PUBLIC_RPC_URL` | Overrides the public Robinhood Chain endpoint |
| `NEXT_PUBLIC_EXPLORER_URL` | Overrides the explorer every address links to |
| `NEXT_PUBLIC_DRAINPAD` / `_GRATE` / `_SUMP` | Override the deployed addresses |

A malformed address override is ignored rather than obeyed: a truncated value in
an environment variable should not turn every page blank.
