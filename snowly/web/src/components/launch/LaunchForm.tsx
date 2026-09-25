"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { isAddress } from "viem";
import { useAccount, useChainId, useWaitForTransactionReceipt, useWriteContract } from "wagmi";

import { Button } from "@/components/ui/Button";
import { Panel, PanelHead } from "@/components/ui/Panel";
import { ROBINHOOD_CHAIN_ID, explorerTx } from "@/lib/chain";
import { snowlyAbi } from "@/lib/abi/snowly";
import { SNOWLY, TICK_SPACING, WHOLE_SUPPLY } from "@/lib/contracts";
import { launchRange } from "@/lib/pool";

/**
 * The launch form.
 *
 * Five fields decide a token and two decide its opening range; everything else
 * about a launch is fixed in the contract and is shown here rather than asked
 * about. The plan below the form is computed from what is typed, so what the
 * transaction will do is legible before it is signed rather than after.
 */
export function LaunchForm() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();

  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [blurb, setBlurb] = useState("");
  const [link, setLink] = useState("");
  const [supplyWallet, setSupplyWallet] = useState("");
  const [floorEth, setFloorEth] = useState("");
  const [ceilEth, setCeilEth] = useState("");

  const { writeContract, data: hash, isPending, error, reset } = useWriteContract();
  const { isLoading: isMining, isSuccess } = useWaitForTransactionReceipt({ hash });

  const range = useMemo(
    () => launchRange({ floorEth, ceilEth, wholeSupply: WHOLE_SUPPLY, tickSpacing: TICK_SPACING }),
    [floorEth, ceilEth],
  );

  const walletTrimmed = supplyWallet.trim();
  const walletValid = walletTrimmed === "" || isAddress(walletTrimmed);

  const problem =
    !name.trim() || !symbol.trim()
      ? "A name and a ticker are the two things a launch cannot do without."
      : !walletValid
        ? "That supply wallet is not an address."
        : !range
          ? "The floor has to be a smaller number than the ceiling, and both have to be positive."
          : null;

  const wrongChain = isConnected && chainId !== ROBINHOOD_CHAIN_ID;

  function submit() {
    if (problem || !range) return;

    writeContract({
      address: SNOWLY,
      abi: snowlyAbi,
      functionName: "launch",
      args: [
        {
          name: name.trim(),
          symbol: symbol.trim(),
          imageURI: "",
          blurb: blurb.trim(),
          link: link.trim(),
          // Zero means "my own address", which the contract reads as the caller.
          supplyWallet: (walletTrimmed === "" ? "0x0000000000000000000000000000000000000000" : walletTrimmed) as `0x${string}`,
          tickSpacing: TICK_SPACING,
          sqrtPriceX96: range.sqrtPriceX96,
          tickLower: range.tickLower,
          tickUpper: range.tickUpper,
        },
      ],
    });
  }

  if (isSuccess) {
    return (
      <Panel accent className="px-5 py-6">
        <h2 className="text-lg">It is on the snowfield.</h2>
        <p className="mt-2 text-sm leading-relaxed text-stone-soft">
          The pool is open and the glacier’s share is in it. That part cannot be undone.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link
            href="/snowfield"
            className="inline-flex items-center rounded-md bg-melt px-4 py-2 text-sm font-medium text-white transition hover:bg-melt-deep"
          >
            See it
          </Link>
          {hash ? (
            <a
              href={explorerTx(hash)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center rounded-md border border-rime px-4 py-2 text-sm text-stone transition hover:border-melt hover:text-melt"
            >
              The transaction ↗
            </a>
          ) : null}
          <Button variant="quiet" onClick={() => reset()}>
            Launch another
          </Button>
        </div>
      </Panel>
    );
  }

  return (
    <div className="space-y-6">
      <Panel>
        <PanelHead title="The token" />
        <div className="grid gap-4 px-5 py-5 sm:grid-cols-2">
          <Field label="Name" hint="what it is called">
            <input className={input} value={name} onChange={(e) => setName(e.target.value)} placeholder="Snowly" />
          </Field>
          <Field label="Ticker" hint="short, no dollar sign">
            <input
              className={input}
              value={symbol}
              onChange={(e) => setSymbol(e.target.value.toUpperCase())}
              placeholder="SNOW"
            />
          </Field>
          <Field label="Blurb" hint="optional, stored on chain" className="sm:col-span-2">
            <input className={input} value={blurb} onChange={(e) => setBlurb(e.target.value)} />
          </Field>
          <Field label="Link" hint="optional" className="sm:col-span-2">
            <input className={input} value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://" />
          </Field>
        </div>
      </Panel>

      <Panel>
        <PanelHead title="The liquid share" note="minted straight to this wallet, unlocked from the first block" />
        <div className="px-5 py-5">
          <Field label="Supply wallet" hint="leave empty and it goes to you">
            <input
              className={input}
              value={supplyWallet}
              onChange={(e) => setSupplyWallet(e.target.value)}
              placeholder={address ?? "0x…"}
            />
          </Field>
          {!walletValid ? <p className="mt-2 text-xs text-crevasse">That is not an address.</p> : null}
        </div>
      </Panel>

      <Panel>
        <PanelHead title="The range" note="what the whole supply is worth, not the price of one token" />
        <div className="grid gap-4 px-5 py-5 sm:grid-cols-2">
          <Field label="Floor" hint="where the pool opens, in ETH">
            <input
              className={input}
              value={floorEth}
              onChange={(e) => setFloorEth(e.target.value)}
              inputMode="decimal"
              placeholder="0.0"
            />
          </Field>
          <Field label="Ceiling" hint="the far end of the range, in ETH">
            <input
              className={input}
              value={ceilEth}
              onChange={(e) => setCeilEth(e.target.value)}
              inputMode="decimal"
              placeholder="0.0"
            />
          </Field>
        </div>
      </Panel>

      <Panel accent className="px-5 py-5">
        <h2 className="text-base">Before you sign</h2>
        <p className="mt-2 text-sm leading-relaxed text-stone-soft">
          The supply, how it is split and what every swap pays are fixed in the launchpad — not chosen here and
          not restated here. Read them in the contract, which is verified with its source published.
        </p>
        <p className="mt-3 text-xs leading-relaxed text-crevasse">
          A launch cannot be undone. The token stays on the snowfield for as long as the launchpad exists, and
          the share that goes into the pool does not come back out.
        </p>
      </Panel>

      {problem ? <p className="text-sm text-stone-faint">{problem}</p> : null}
      {wrongChain ? <p className="text-sm text-crevasse">Switch your wallet to Robinhood Chain first.</p> : null}
      {error ? (
        <p className="text-sm text-crevasse">
          {error.message.split("\n")[0]}
        </p>
      ) : null}

      <Button
        onClick={submit}
        disabled={!isConnected || Boolean(problem) || wrongChain || isPending || isMining}
        className="w-full sm:w-auto"
      >
        {!isConnected
          ? "Connect a wallet first"
          : isPending
            ? "Confirm in your wallet…"
            : isMining
              ? "Launching…"
              : "Launch"}
      </Button>
    </div>
  );
}

const input =
  "w-full rounded-md border border-rime bg-field-deep px-3 py-2 text-sm text-stone outline-none transition placeholder:text-stone-faint focus:border-melt focus:bg-surface";

function Field({
  label,
  hint,
  children,
  className = "",
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="label">{label}</span>
      {hint ? <span className="ml-2 text-xs text-stone-faint">{hint}</span> : null}
      <span className="mt-1.5 block">{children}</span>
    </label>
  );
}
