"use client";

import { useMemo, useState } from "react";
import { useAccount, useWaitForTransactionReceipt, useWriteContract } from "wagmi";

import { Button } from "@/components/ui/Button";
import { Field, Input, Textarea } from "@/components/ui/Field";
import { EmptyState } from "@/components/ui/EmptyState";
import { explorerTx } from "@/lib/chain";
import { CLAYSPAD_ADDRESS, LAUNCH_TICK_SPACING, NATIVE, SHELF_IS_OPEN, clayspadAbi } from "@/lib/contracts";
import { launchRange } from "@/lib/pool";

/** The supply is a constant in the launchpad; this is only the whole-token count the range is priced across. */
const WHOLE_SUPPLY = 1_000_000_000n;

export function LaunchForm() {
  const { address, isConnected } = useAccount();
  const { writeContract, data: hash, isPending, error, reset } = useWriteContract();
  const { isLoading: isMining, isSuccess } = useWaitForTransactionReceipt({ hash });

  const [form, setForm] = useState({
    name: "",
    symbol: "",
    blurb: "",
    link: "",
    imageURI: "",
    supplyWallet: "",
    floorEth: "1.7",
    ceilEth: "170",
  });

  const set = (key: keyof typeof form) => (event: { target: { value: string } }) =>
    setForm((previous) => ({ ...previous, [key]: event.target.value }));

  const range = useMemo(
    () =>
      launchRange({
        floorEth: form.floorEth,
        ceilEth: form.ceilEth,
        wholeSupply: WHOLE_SUPPLY,
        tickSpacing: LAUNCH_TICK_SPACING,
      }),
    [form.floorEth, form.ceilEth],
  );

  const walletValid = form.supplyWallet === "" || /^0x[0-9a-fA-F]{40}$/.test(form.supplyWallet.trim());
  const ready = SHELF_IS_OPEN && isConnected && form.name.trim() !== "" && form.symbol.trim() !== "" && range !== null && walletValid;

  if (!SHELF_IS_OPEN) {
    return (
      <EmptyState title="There is nothing to launch into yet">
        <p>
          Clayspad is not deployed, so this form has no contract to send a transaction to. It is left here rather than
          hidden because the fields it asks for are the whole of what a launch decides.
        </p>
      </EmptyState>
    );
  }

  function submit() {
    if (!ready || !range) return;
    reset();

    writeContract({
      address: CLAYSPAD_ADDRESS!,
      abi: clayspadAbi,
      functionName: "launch",
      args: [
        {
          name: form.name.trim(),
          symbol: form.symbol.trim().toUpperCase(),
          imageURI: form.imageURI.trim(),
          blurb: form.blurb.trim(),
          link: form.link.trim(),
          // Zero means "the wallet I am launching from", which the contract substitutes.
          supplyWallet: (form.supplyWallet.trim() || NATIVE) as `0x${string}`,
          tickSpacing: LAUNCH_TICK_SPACING,
          sqrtPriceX96: range.sqrtPriceX96,
          tickLower: range.tickLower,
          tickUpper: range.tickUpper,
        },
      ],
    });
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Name">
          <Input value={form.name} onChange={set("name")} placeholder="Kiln Street" maxLength={64} />
        </Field>
        <Field label="Ticker">
          <Input value={form.symbol} onChange={set("symbol")} placeholder="KILN" maxLength={12} />
        </Field>
      </div>

      <Field label="What it is" hint="One or two lines. It goes on the shelf and on the token's page.">
        <Textarea value={form.blurb} onChange={set("blurb")} maxLength={280} />
      </Field>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Link" hint="Optional.">
          <Input value={form.link} onChange={set("link")} placeholder="https://" />
        </Field>
        <Field label="Image URI" hint="Optional. ipfs:// or https://.">
          <Input value={form.imageURI} onChange={set("imageURI")} placeholder="ipfs://" />
        </Field>
      </div>

      <Field
        label="Supply wallet"
        hint={
          <>
            Where the share that is not fired into the pool is minted. It is liquid from the first block — not vested,
            not cliffed, not locked. Leave this empty and it goes to{" "}
            <span className="text-paper-dim">{address ?? "the wallet you launch from"}</span>.
          </>
        }
      >
        <Input value={form.supplyWallet} onChange={set("supplyWallet")} placeholder="0x…" />
      </Field>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Opening market cap (ETH)" hint="What the whole supply is worth where the pool opens.">
          <Input value={form.floorEth} onChange={set("floorEth")} inputMode="decimal" />
        </Field>
        <Field label="Range ceiling (ETH)" hint="Where the range runs out, priced the same way.">
          <Input value={form.ceilEth} onChange={set("ceilEth")} inputMode="decimal" />
        </Field>
      </div>

      {!walletValid ? (
        <p className="text-sm text-amber-400">That supply wallet is not an address.</p>
      ) : null}

      {form.floorEth && form.ceilEth && !range ? (
        <p className="text-sm text-amber-400">
          The ceiling has to sit above the floor, and both have to be plain decimal numbers.
        </p>
      ) : null}

      {range ? (
        <p className="text-xs leading-relaxed text-clay">
          Ticks {range.tickLower} to {range.tickUpper}, on a grid of {LAUNCH_TICK_SPACING}. The pool opens at the top of
          that range, which is where the token is cheapest — the whole of the kiln&apos;s share sits below the opening
          price, so the first buy fills and the pool never needs ETH nobody has put in.
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3 border-t border-clay-dark pt-6">
        <Button tone="signal" onClick={submit} disabled={!ready || isPending || isMining}>
          {isPending ? "Confirm in your wallet…" : isMining ? "Firing…" : "Launch"}
        </Button>
        {!isConnected ? <span className="text-sm text-paper-faint">Connect a wallet first.</span> : null}
      </div>

      {error ? (
        <p className="max-w-prose text-sm leading-relaxed text-amber-400">
          {error.message.split("\n")[0]}
        </p>
      ) : null}

      {isSuccess && hash ? (
        <p className="text-sm text-signal">
          Fired.{" "}
          <a href={explorerTx(hash)} target="_blank" rel="noreferrer" className="underline">
            See the transaction ↗
          </a>
        </p>
      ) : null}
    </div>
  );
}
