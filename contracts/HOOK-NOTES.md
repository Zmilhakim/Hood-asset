# Taking the fee with a hook instead of the pool

A decision recorded before it is built, so the reasoning survives the gap.

## What changes

Hoodpad today launches into Uniswap **v3**. The pool charges 1% per swap, and
that 1% belongs to whoever owns the liquidity position — which the factory
hands to `PositionLocker`, payable to the poster. The board itself takes
nothing, and cannot: there is no code path that would let it.

A Uniswap **v4 hook** is a different mechanism. A hook is a contract attached
to a pool at initialisation, which the PoolManager calls around every swap. A
hook with the return-delta permission can claim part of the swap amount for
itself. That is a fee the *board* collects, on every trade of every token
launched through it, independent of who owns the liquidity.

That is the difference between the two, and it is the whole point: the current
design cannot earn from other people's launches, and a hook can.

## What it costs

**A new board.** `HoodpadFactory` at `0xC935a139AbB08a2eF8480d8E793CCD5c68a7c739`
is immutable, ownerless, and built against v3. It cannot be upgraded or
repointed. A hook means a second factory on v4, and the first one keeps running
forever — two boards, both real.

**A new claim.** The site and the launch posts currently say the board takes
nothing, and that is true of the v3 board. It would not be true of a v4 board
with a fee hook. The copy has to say which board a reader is looking at, or it
becomes a lie the moment the second one exists.

**Address mining.** A v4 hook's permissions are encoded in the low bits of its
own address — the PoolManager reads the address to know which callbacks to
make. Deploying one means searching CREATE2 salts until the address carries the
right flags. The exact constants come from v4-core's `Hooks` library and should
be read from the version deployed on this chain rather than assumed.

**Per-pool and permanent.** The hook is fixed at pool initialisation. A pool
opened with a hook keeps it for good, and a pool opened without one can never
gain it.

## What to settle before writing any of it

- The rate. A hook fee is a tax on every trade, paid by holders of every token
  on that board. Too high and nobody launches there.
- Who receives it. `treasury` is already an immutable constructor argument in
  the v3 factory; the v4 one should keep that shape.
- Whether the poster still keeps the LP fee. Both can be true at once — the
  hook fee and the LP fee are separate in v4 — and saying so plainly is what
  keeps the offer honest.

## Addresses

| What | Address | Source |
| --- | --- | --- |
| v4 PoolManager | `0x8366a39CC670B4001A1121B8F6A443A643e40951` | recorded by the CRATE work in `crate/contracts/crate.config.json` |
| v3 board (live) | `0xC935a139AbB08a2eF8480d8E793CCD5c68a7c739` | deployed 2026-09-16 |

The PoolManager address has not been verified from this session — the network
here cannot reach the chain. Check it with `cast code` or the explorer before
spending gas against it.
