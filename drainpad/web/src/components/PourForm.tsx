"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { isAddress, type Address as Hex } from "viem";
import { useAccount, useSimulateContract, useWaitForTransactionReceipt, useWriteContract } from "wagmi";

import { drainpadAbi } from "@/lib/abi/drainpad";
import { explorerTx } from "@/lib/chain";
import {
  DRAINPAD,
  RANGE_CEIL_ETH,
  RANGE_FLOOR_ETH,
  TICK_SPACING,
  WHOLE_SUPPLY,
} from "@/lib/contracts";
import { pourRange, pricePerToken } from "@/lib/range";
import { safeUrl } from "@/lib/catchment";
import { Wallet } from "./Wallet";

/**
 * The range every pour opens across, worked out once.
 *
 * It is the house range — the same for every launch, a constant in the
 * launchpad rather than a field on this form — so it is computed here and never
 * shown. What the form collects is the name, the ticker, the picture and the
 * wallet. That is the whole list of what a creator chooses.
 */
function useRange() {
  return useMemo(
    () =>
      pourRange({
        floorEthPerToken: pricePerToken(RANGE_FLOOR_ETH, WHOLE_SUPPLY),
        ceilEthPerToken: pricePerToken(RANGE_CEIL_ETH, WHOLE_SUPPLY),
        tickSpacing: TICK_SPACING,
      }),
    [],
  );
}

const ZERO = "0x0000000000000000000000000000000000000000" as const;

export function PourForm() {
  const { address, isConnected } = useAccount();
  const range = useRange();

  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [imageURI, setImageURI] = useState("");
  const [blurb, setBlurb] = useState("");
  const [link, setLink] = useState("");
  const [supplyWallet, setSupplyWallet] = useState("");

  const walletError =
    supplyWallet.trim() !== "" && !isAddress(supplyWallet.trim()) ? "That is not an address." : null;
  const imageError = imageURI.trim() !== "" && !safeUrl(imageURI) ? "Use an http or https link." : null;
  const linkError = link.trim() !== "" && !safeUrl(link) ? "Use an http or https link." : null;

  const ready =
    isConnected && name.trim() !== "" && symbol.trim() !== "" && !walletError && !imageError && !linkError;

  const params = {
    name: name.trim(),
    symbol: symbol.trim().toUpperCase(),
    imageURI: imageURI.trim(),
    blurb: blurb.trim(),
    link: link.trim(),
    supplyWallet: (supplyWallet.trim() === "" ? ZERO : (supplyWallet.trim() as Hex)) as Hex,
    tickSpacing: TICK_SPACING,
    sqrtPriceX96: range.sqrtPriceX96,
    tickLower: range.tickLower,
    tickUpper: range.tickUpper,
  } as const;

  // Simulated against the live launchpad before anything is signed: a pour that
  // would revert is better learned about here than from a receipt.
  const simulation = useSimulateContract({
    address: DRAINPAD,
    abi: drainpadAbi,
    functionName: "launch",
    args: [params],
    account: address,
    query: { enabled: ready },
  });

  const { writeContract, data: hash, isPending, reset } = useWriteContract();
  const receipt = useWaitForTransactionReceipt({ hash });

  if (receipt.isSuccess && hash) {
    return (
      <div className="slab p-6">
        <div className="stencil mb-3">Poured</div>
        <h2 className="font-display text-2xl font-extrabold uppercase text-chalk">It is down there now</h2>
        <p className="mt-3 max-w-lg text-sm leading-relaxed text-grit">
          The token is minted, the pool is open, and the pool&apos;s share is in the sump. None of that has a way back.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link
            href="/catchment"
            className="border border-paint px-4 py-2 font-display text-xs font-bold uppercase tracking-[0.14em] text-paint transition-colors hover:bg-paint hover:text-asphalt-deep"
          >
            See the catchment
          </Link>
          <a
            href={explorerTx(hash)}
            target="_blank"
            rel="noreferrer"
            className="border border-kerb px-4 py-2 font-display text-xs font-bold uppercase tracking-[0.14em] text-chalk transition-colors hover:border-kerb-bright"
          >
            The transaction
          </a>
          <button
            type="button"
            onClick={() => reset()}
            className="stencil-dim px-2 transition-colors hover:text-paint"
          >
            Pour another
          </button>
        </div>
      </div>
    );
  }

  const revert = simulation.error?.message?.split("\n")[0];

  return (
    <div className="grid gap-6 md:grid-cols-[1.3fr_1fr] md:items-start">
      <form
        className="slab space-y-5 p-5 md:p-6"
        onSubmit={(event) => {
          event.preventDefault();
          if (simulation.data?.request) writeContract(simulation.data.request);
        }}
      >
        <Field label="Name" hint="What it is called. Required.">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={64}
            placeholder="Storm Water"
            className={input}
          />
        </Field>

        <Field label="Ticker" hint="Required. Uppercased on the way in.">
          <input
            value={symbol}
            onChange={(e) => setSymbol(e.target.value.toUpperCase())}
            maxLength={16}
            placeholder="STORM"
            className={`${input} figure`}
          />
        </Field>

        <Field label="Picture" hint="A link to an image. Optional." error={imageError}>
          <input
            value={imageURI}
            onChange={(e) => setImageURI(e.target.value)}
            placeholder="https://"
            className={input}
          />
        </Field>

        <Field label="A line about it" hint="Optional, and it goes on chain as typed.">
          <textarea
            value={blurb}
            onChange={(e) => setBlurb(e.target.value)}
            maxLength={280}
            rows={3}
            className={`${input} resize-none`}
          />
        </Field>

        <Field label="Link" hint="Optional." error={linkError}>
          <input value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://" className={input} />
        </Field>

        <Field
          label="Supply wallet"
          hint="Where the unlocked share is minted. Leave it empty and it is your own address."
          error={walletError}
        >
          <input
            value={supplyWallet}
            onChange={(e) => setSupplyWallet(e.target.value)}
            placeholder="0x"
            className={`${input} figure`}
          />
        </Field>

        {revert && ready ? (
          <p className="border border-rust/50 bg-rust/5 p-3 text-sm leading-relaxed text-rust">
            The pour would revert: {revert}
          </p>
        ) : null}

        {isConnected ? (
          <button
            type="submit"
            disabled={!ready || !simulation.data || isPending || receipt.isLoading}
            className="w-full border border-paint bg-paint py-3 font-display text-sm font-bold uppercase tracking-[0.14em] text-asphalt-deep transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isPending ? "Confirm in your wallet" : receipt.isLoading ? "Going down" : "Pour it"}
          </button>
        ) : (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-grit">Connect a wallet to pour.</p>
            <Wallet />
          </div>
        )}
      </form>

      <aside className="slab p-5 md:p-6">
        <div className="stencil mb-3">What you are choosing</div>
        <p className="text-sm leading-relaxed text-grit">
          The name, the ticker, the picture, the line, the link, and the wallet the unlocked share lands in. That is
          the whole list.
        </p>
        <div className="stencil mt-6 mb-3">What you are not</div>
        <p className="text-sm leading-relaxed text-grit">
          The supply, the split, what the grate keeps, and the range the pool opens across are the same for every pour.
          They are constants in the launchpad rather than settings on this form, so there is one thing to check instead
          of one per token.
        </p>
        <Link href="/how" className="stencil mt-6 inline-block transition-colors hover:text-chalk">
          Read them at the source →
        </Link>
        <p className="mt-6 border-t border-kerb pt-4 text-xs leading-relaxed text-grit-dim">
          A pour cannot be undone. The row it writes into the launchpad is there from that block onwards, and so is the
          pool.
        </p>
      </aside>
    </div>
  );
}

const input =
  "w-full border border-kerb bg-asphalt px-3 py-2.5 text-sm text-chalk outline-none transition-colors placeholder:text-grit-dim focus:border-paint";

function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string | null;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="stencil">{label}</span>
      {hint ? <span className="mt-1 block text-xs text-grit-dim">{hint}</span> : null}
      <div className="mt-2">{children}</div>
      {error ? <span className="mt-1 block text-xs text-rust">{error}</span> : null}
    </label>
  );
}
