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
import { explorerAddress, explorerTx, ROBINHOOD_CHAIN_ID } from "@/lib/chain";
import {
  BOARD_IS_OPEN,
  FACTORY_ADDRESS,
  hoodpadFactoryAbi,
  LAUNCH_FEE_TIER,
  LAUNCH_TICK_SPACING,
} from "@/lib/contracts";
import { formatEth, shortAddress } from "@/lib/format";
import { planLaunch } from "@/lib/pool";

const SUPPLY = 1_000_000_000;

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
  const { stats } = useBoardStats();

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }));

  const name = draft.name.trim();
  const symbol = draft.symbol.trim().toUpperCase();
  const ready = name.length > 0 && symbol.length > 0 && salt !== null;

  const { data: weth } = useReadContract({ ...read, functionName: "weth", query: { enabled: BOARD_IS_OPEN } });

  const { data: predicted } = useReadContract({
    ...read,
    functionName: "predictToken",
    args: ready ? [name, symbol, salt] : undefined,
    query: { enabled: BOARD_IS_OPEN && ready },
  });

  const opening = Number(draft.openingValuation);
  const ceiling = Number(draft.ceilingValuation);

  // The token's address decides which side of the pool it sits on, which flips
  // the entire tick axis — so the plan can only be built once it is known.
  const plan = useMemo(() => {
    if (!predicted || !weth || !(opening > 0) || !(ceiling > 0)) return null;
    try {
      return {
        value: planLaunch({
          tokenIsToken0: (predicted as string).toLowerCase() < (weth as string).toLowerCase(),
          openingPrice: opening / SUPPLY,
          ceilingPrice: ceiling / SUPPLY,
          spacing: LAUNCH_TICK_SPACING,
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
  const blocker = !BOARD_IS_OPEN
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
    if (blocker || !plan?.value || !salt || !FACTORY_ADDRESS) return;

    writeContract({
      address: FACTORY_ADDRESS,
      abi: hoodpadFactoryAbi,
      functionName: "postToken",
      chainId: ROBINHOOD_CHAIN_ID,
      value: stats?.postingFee ?? 0n,
      args: [
        {
          salt,
          name,
          symbol,
          imageURI: draft.imageURI.trim(),
          blurb: draft.blurb.trim(),
          link: draft.link.trim(),
          sqrtPriceX96: plan.value.sqrtPriceX96,
          tickLower: plan.value.tickLower,
          tickUpper: plan.value.tickUpper,
          fee: LAUNCH_FEE_TIER,
        },
      ],
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
      <Panel label="Post a notice" aside={<Badge tone="idle">Fee {formatEth(stats?.postingFee) ?? "n/a"}</Badge>}>
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
            <StatTile label="Pool fee" value={`${LAUNCH_FEE_TIER / 10_000}%`} />
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
              hint={plan?.value ? "the band the supply sells across" : "needs the token address first"}
              className="col-span-2"
            />
            <StatTile
              label="Token address"
              value={predicted ? shortAddress(predicted as string) : null}
              hint="known before you sign, via CREATE2"
              className="col-span-2"
            />
          </div>

          {predicted && (
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
            Posted by {shortAddress(address) ?? "nobody yet"} · fees from the locked position stay claimable by that
            address
          </p>
        </Panel>
      </div>
    </div>
  );
}
