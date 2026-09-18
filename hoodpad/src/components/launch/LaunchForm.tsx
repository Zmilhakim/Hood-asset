"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useConnection, useReadContract, useWaitForTransactionReceipt, useWriteContract } from "wagmi";

import { Badge } from "@/components/ui/Badge";
import { Button, buttonClasses } from "@/components/ui/Button";
import { Field, TextField } from "@/components/ui/Field";
import { Panel } from "@/components/ui/Panel";
import { StatTile } from "@/components/ui/StatTile";
import { NoticeImage } from "@/components/board/NoticeImage";
import { useBoardStats } from "@/lib/board";
import { useV4BoardStats } from "@/lib/board-v4";
import { explorerAddress, explorerTx, ROBINHOOD_CHAIN_ID } from "@/lib/chain";
import {
  BOARD_IS_OPEN,
  FACTORY_ADDRESS,
  hoodpadFactoryAbi,
  LAUNCH_FEE_TIER,
  LAUNCH_TICK_SPACING,
} from "@/lib/contracts";
import {
  hoodpadV4FactoryAbi,
  V4_BOARD_IS_OPEN,
  V4_FACTORY_ADDRESS,
  V4_LAUNCH_FEE_TIER,
  V4_LAUNCH_TICK_SPACING,
} from "@/lib/contracts-v4";
import { formatEth, shortAddress } from "@/lib/format";
import { planLaunch } from "@/lib/pool";
import { planV4Launch } from "@/lib/pool-v4";

const SUPPLY = 1_000_000_000;

/**
 * Which board this form posts to.
 *
 * The v4 board is the one with the hook, so it wins wherever it is configured;
 * the v3 board stays the fallback so an environment that has not deployed v4 yet
 * keeps working unchanged. It is a module constant rather than state because the
 * two boards need different reads, and a value that could flip mid-render would
 * mean calling different hooks on different renders.
 */
const ON_V4 = V4_BOARD_IS_OPEN;
const BOARD_OPEN = ON_V4 ? V4_BOARD_IS_OPEN : BOARD_IS_OPEN;
const BOARD_ADDRESS = ON_V4 ? V4_FACTORY_ADDRESS : FACTORY_ADDRESS;
const FEE_TIER = ON_V4 ? V4_LAUNCH_FEE_TIER : LAUNCH_FEE_TIER;
const TICK_SPACING = ON_V4 ? V4_LAUNCH_TICK_SPACING : LAUNCH_TICK_SPACING;

const read = { address: FACTORY_ADDRESS, abi: hoodpadFactoryAbi, chainId: ROBINHOOD_CHAIN_ID } as const;

type Draft = {
  name: string;
  symbol: string;
  imageURI: string;
  blurb: string;
  link: string;
  openingValuation: string;
  ceilingValuation: string;
};

const EMPTY: Draft = {
  name: "",
  symbol: "",
  imageURI: "",
  blurb: "",
  link: "",
  openingValuation: "1",
  ceilingValuation: "100",
};

function randomSalt(): `0x${string}` {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return `0x${[...bytes].map((b) => b.toString(16).padStart(2, "0")).join("")}`;
}

function formatPrice(price: number) {
  return `${price.toExponential(3)} ETH`;
}

export function LaunchForm() {
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [salt, setSalt] = useState<`0x${string}` | null>(null);

  // Generated after mount so the server and first client paint agree.
  useEffect(() => setSalt(randomSalt()), []);

  const { address, chainId, isConnected } = useConnection();

  // Both are read, and only the configured board's is used. Each hook gates its
  // own request on its board being open, so the other one never fires.
  const v3Board = useBoardStats();
  const v4Board = useV4BoardStats();
  const postingFee = (ON_V4 ? v4Board.stats?.postingFee : v3Board.stats?.postingFee) ?? 0n;
  const hookFeeBps = v4Board.stats?.hookFeeBps;

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }));

  const name = draft.name.trim();
  const symbol = draft.symbol.trim().toUpperCase();
  // On v4 the salt is not part of a launch at all — see the plan below.
  const ready = name.length > 0 && symbol.length > 0 && (ON_V4 || salt !== null);

  const { data: weth } = useReadContract({
    ...read,
    functionName: "weth",
    query: { enabled: !ON_V4 && BOARD_IS_OPEN },
  });

  const { data: predicted } = useReadContract({
    ...read,
    functionName: "predictToken",
    args: ready && salt ? [name, symbol, salt] : undefined,
    query: { enabled: !ON_V4 && BOARD_IS_OPEN && ready && salt !== null },
  });

  const opening = Number(draft.openingValuation);
  const ceiling = Number(draft.ceilingValuation);

  // On v3 the token's address decides which side of the pool it sits on, which
  // flips the entire tick axis — so the plan cannot be built until the address is
  // known. On v4 the other side is native ETH, which is address zero and so is
  // always currency0; the token is always currency1 and there is nothing to wait
  // for. That is why the v4 branch needs neither `predicted` nor `weth`.
  const plan = useMemo(() => {
    if (!(opening > 0) || !(ceiling > 0)) return null;

    try {
      if (ON_V4) {
        return {
          value: planV4Launch({
            openingCapEth: opening,
            ceilingCapEth: ceiling,
            spacing: TICK_SPACING,
            supply: SUPPLY,
          }),
          error: null as string | null,
        };
      }

      if (!predicted || !weth) return null;

      return {
        value: planLaunch({
          tokenIsToken0: (predicted as string).toLowerCase() < (weth as string).toLowerCase(),
          openingPrice: opening / SUPPLY,
          ceilingPrice: ceiling / SUPPLY,
          spacing: TICK_SPACING,
        }),
        error: null as string | null,
      };
    } catch (error) {
      return { value: null, error: error instanceof Error ? error.message : "could not price this range" };
    }
  }, [predicted, weth, opening, ceiling]);

  const { writeContract, data: hash, isPending, error: writeError, reset } = useWriteContract();
  const receipt = useWaitForTransactionReceipt({ hash });

  const wrongChain = isConnected && chainId !== ROBINHOOD_CHAIN_ID;
  const blocker = !BOARD_OPEN
    ? "Hoodpad is not deployed on Robinhood Chain yet."
    : !isConnected
      ? "Connect a wallet to post."
      : wrongChain
        ? `Switch to Robinhood Chain (${ROBINHOOD_CHAIN_ID}).`
        : !ready
          ? "A name and a ticker are the minimum."
          : plan?.error
            ? plan.error
            : !plan?.value
              ? "Reading the chain…"
              : null;

  const submit = () => {
    if (blocker || !plan?.value || !BOARD_ADDRESS) return;

    const metadata = {
      name,
      symbol,
      imageURI: draft.imageURI.trim(),
      blurb: draft.blurb.trim(),
      link: draft.link.trim(),
      sqrtPriceX96: plan.value.sqrtPriceX96,
      tickLower: plan.value.tickLower,
      tickUpper: plan.value.tickUpper,
      fee: FEE_TIER,
    };

    if (ON_V4) {
      writeContract({
        address: BOARD_ADDRESS,
        abi: hoodpadV4FactoryAbi,
        functionName: "postToken",
        chainId: ROBINHOOD_CHAIN_ID,
        value: postingFee,
        // No salt: v4 needs no address prediction. The tick spacing travels in
        // the params instead, because in v4 it is part of the pool's key rather
        // than a property of the fee tier.
        args: [{ ...metadata, tickSpacing: TICK_SPACING }],
      });
      return;
    }

    if (!salt) return;

    writeContract({
      address: BOARD_ADDRESS,
      abi: hoodpadFactoryAbi,
      functionName: "postToken",
      chainId: ROBINHOOD_CHAIN_ID,
      value: postingFee,
      args: [{ ...metadata, salt }],
    });
  };

  if (receipt.isSuccess && hash) {
    return (
      <Panel label="Posted" aside={<Badge tone="live">On the board</Badge>}>
        <h2 className="font-display text-2xl">${symbol} is up</h2>
        <p className="mt-2 max-w-prose text-sm text-ink-soft">
          The supply is minted, the pool is open and the position is locked. Nothing about it can be changed now —
          including by you.
        </p>
        <div className="mt-5 flex flex-wrap gap-2.5">
          <Link href="/board" className={buttonClasses("flame")}>
            See the board
          </Link>
          <a href={explorerTx(hash)} target="_blank" rel="noreferrer noopener" className={buttonClasses("quiet")}>
            Transaction ↗
          </a>
          <Button
            tone="quiet"
            onClick={() => {
              reset();
              setDraft(EMPTY);
              setSalt(randomSalt());
            }}
          >
            Post another
          </Button>
        </div>
      </Panel>
    );
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[1.25fr_1fr] lg:items-start">
      <Panel label="Post a notice" aside={<Badge tone="idle">Posting {formatEth(postingFee) ?? "free"}</Badge>}>
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
            <Field
              label="Name"
              placeholder="Your token name"
              value={draft.name}
              maxLength={48}
              onChange={(e) => set("name", e.target.value)}
            />
            <Field
              label="Ticker"
              placeholder="TICKER"
              value={draft.symbol}
              maxLength={11}
              onChange={(e) => set("symbol", e.target.value.toUpperCase())}
            />
          </div>

          <Field
            label="Image URL"
            placeholder="https://… or ipfs://…"
            value={draft.imageURI}
            onChange={(e) => set("imageURI", e.target.value)}
            hint="Shown on the notice. Left blank, the ticker stands in."
          />

          <TextField
            label="The pitch"
            rows={3}
            maxLength={280}
            placeholder="One or two lines. It goes on the board as written."
            value={draft.blurb}
            onChange={(e) => set("blurb", e.target.value)}
            hint={`${draft.blurb.length}/280`}
          />

          <Field
            label="Link"
            placeholder="https://x.com/…"
            value={draft.link}
            onChange={(e) => set("link", e.target.value)}
          />

          <div className="border-t-2 border-dashed border-ink/20 pt-4">
            <p className="micro text-ink-soft">The curve</p>
            <p className="mt-1 text-sm text-ink-soft">
              The whole supply goes into the pool on its own, priced from your opening valuation up to your ceiling.
              No ETH of yours is needed, and none is taken.
            </p>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <Field
                label="Opening valuation (ETH)"
                type="number"
                min="0"
                step="any"
                inputMode="decimal"
                value={draft.openingValuation}
                onChange={(e) => set("openingValuation", e.target.value)}
                error={opening > 0 ? null : "must be above zero"}
              />
              <Field
                label="Ceiling valuation (ETH)"
                type="number"
                min="0"
                step="any"
                inputMode="decimal"
                value={draft.ceilingValuation}
                onChange={(e) => set("ceilingValuation", e.target.value)}
                error={ceiling > opening ? null : "must sit above the opening"}
              />
            </div>
          </div>

          {(writeError || receipt.isError) && (
            <p className="border-2 border-flame-deep bg-flame/10 px-3 py-2 text-sm text-flame-deep">
              {writeError?.message.split("\n")[0] ?? "The transaction did not go through."}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={submit} disabled={Boolean(blocker) || isPending || receipt.isLoading}>
              {isPending ? "Confirm in wallet…" : receipt.isLoading ? "Posting…" : "Post a notice"}
            </Button>
            {blocker && <span className="micro text-ink-faint">{blocker}</span>}
          </div>
        </div>
      </Panel>

      <div className="space-y-5">
        <Panel label="How it will read">
          <div className="flex gap-3">
            <NoticeImage src={draft.imageURI.trim()} symbol={symbol || "???"} className="size-16 shrink-0" />
            <div className="min-w-0">
              <h3 className="font-display truncate text-lg leading-tight">{name || "Untitled"}</h3>
              <p className="micro font-semibold text-flame-deep">${symbol || "???"}</p>
              <p className="mt-1.5 line-clamp-3 text-sm text-ink-soft">
                {draft.blurb.trim() || "No pitch written yet."}
              </p>
            </div>
          </div>
        </Panel>

        <Panel label="What gets written to chain">
          <div className="grid grid-cols-2 gap-2.5">
            <StatTile label="Supply" value="1,000,000,000" hint="fixed, not a setting" />
            <StatTile
              label={ON_V4 ? "Swap fee" : "Pool fee"}
              value={
                ON_V4
                  ? hookFeeBps === undefined
                    ? `${FEE_TIER / 10_000}% LP`
                    : `${FEE_TIER / 10_000}% + ${Number(hookFeeBps) / 100}%`
                  : `${FEE_TIER / 10_000}%`
              }
              hint={ON_V4 ? "LP fee plus the hook's cut, both yours" : undefined}
            />
            <StatTile
              label="Opening price"
              value={
                plan?.value
                  ? formatPrice(plan.value.effectiveOpeningPrice)
                  : opening > 0
                    ? formatPrice(opening / SUPPLY)
                    : null
              }
              hint={plan?.value ? "per token, snapped to the tick grid" : "per token, before tick snapping"}
            />
            <StatTile
              label="Ceiling price"
              value={
                plan?.value
                  ? formatPrice(plan.value.effectiveCeilingPrice)
                  : ceiling > opening
                    ? formatPrice(ceiling / SUPPLY)
                    : null
              }
              hint="per token"
            />
            <StatTile
              label="Tick range"
              value={plan?.value ? `${plan.value.tickLower} → ${plan.value.tickUpper}` : null}
              hint={
                plan?.value
                  ? "the band the supply sells across"
                  : ON_V4
                    ? "needs an opening and a ceiling"
                    : "needs the token address first"
              }
              className="col-span-2"
            />
            <StatTile
              label="Token address"
              value={ON_V4 ? "assigned at launch" : predicted ? shortAddress(predicted as string) : null}
              hint={
                ON_V4
                  ? "v4 needs no prediction: ETH is always currency0"
                  : "known before you sign, via CREATE2"
              }
              className="col-span-2"
            />
          </div>

          {!ON_V4 && predicted && (
            <a
              href={explorerAddress(predicted as string)}
              target="_blank"
              rel="noreferrer noopener"
              className="micro mt-3 inline-block text-ink-soft underline underline-offset-2 hover:text-flame-deep"
            >
              Check the address is still empty ↗
            </a>
          )}

          <p className="micro mt-3 text-ink-faint">
            Posted by {shortAddress(address) ?? "nobody yet"} ·{" "}
            {ON_V4
              ? "the hook's cut and the position's fees both stay claimable by that address"
              : "fees from the locked position stay claimable by that address"}
          </p>
        </Panel>
      </div>
    </div>
  );
}
