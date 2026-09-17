"use client";

import { useEffect, useMemo, useState } from "react";
import {
  useBalance,
  useConnection,
  useReadContract,
  useSimulateContract,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import { Button } from "@/components/ui/Button";
import { ROUTER_ADDRESS, TICKER, TOKEN_ADDRESS, V4_QUOTER } from "@/lib/addresses";
import { ROBINHOOD_CHAIN_ID, explorerTx } from "@/lib/chain";
import { applySlippage, formatAmount, formatEthAmount, parseAmount } from "@/lib/format";
import { cratePoolKey, erc20Abi, quoterAbi } from "@/lib/pool";
import { crateRouterAbi } from "@/lib/abi/crateRouter";

const SLIPPAGE_CHOICES = [0.5, 2, 5] as const;
const DEADLINE_MINUTES = 20;

type Mode = "buy" | "sell";

export function Swap() {
  const { address, chainId, isConnected } = useConnection();
  const [mode, setMode] = useState<Mode>("buy");
  const [input, setInput] = useState("");
  const [slippage, setSlippage] = useState<number>(2);

  const token = TOKEN_ADDRESS!;
  const router = ROUTER_ADDRESS!;
  const poolKey = useMemo(() => cratePoolKey(token), [token]);

  const buying = mode === "buy";
  const amountIn = parseAmount(input);
  const hasAmount = amountIn !== null && amountIn > 0n;

  const ethBalance = useBalance({ address, query: { enabled: Boolean(address) } });
  const crateBalance = useReadContract({
    address: token,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: Boolean(address) },
  });

  const balance = buying ? (ethBalance.data?.value ?? 0n) : ((crateBalance.data as bigint | undefined) ?? 0n);
  const overBalance = hasAmount && amountIn > balance;

  // The quote comes from Uniswap's own V4Quoter rather than from arithmetic
  // here. It is not a view function, but eth_call runs it happily, and it walks
  // the same tick math the swap will.
  const quote = useSimulateContract({
    address: V4_QUOTER,
    abi: quoterAbi,
    functionName: "quoteExactInputSingle",
    args: hasAmount ? [{ poolKey, zeroForOne: buying, exactAmount: amountIn, hookData: "0x" as const }] : undefined,
    query: { enabled: hasAmount, retry: false },
  });

  const amountOut = (quote.data?.result?.[0] as bigint | undefined) ?? 0n;
  const minimumOut = amountOut > 0n ? applySlippage(amountOut, slippage) : 0n;

  // Selling moves an ERC20, so the router needs an allowance first. Buying
  // sends ETH with the call and needs nothing.
  const allowance = useReadContract({
    address: token,
    abi: erc20Abi,
    functionName: "allowance",
    args: address ? [address, router] : undefined,
    query: { enabled: Boolean(address) && !buying },
  });
  const needsApproval = !buying && hasAmount && ((allowance.data as bigint | undefined) ?? 0n) < amountIn;

  const { writeContract, data: hash, isPending, error: writeError, reset } = useWriteContract();
  const receipt = useWaitForTransactionReceipt({ hash });

  // A confirmed trade makes every balance on screen stale.
  useEffect(() => {
    if (!receipt.isSuccess) return;
    setInput("");
    ethBalance.refetch();
    crateBalance.refetch();
    allowance.refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [receipt.isSuccess]);

  const deadline = () => BigInt(Math.floor(Date.now() / 1000) + DEADLINE_MINUTES * 60);

  const submit = () => {
    if (!hasAmount) return;
    reset();

    if (needsApproval) {
      writeContract({ address: token, abi: erc20Abi, functionName: "approve", args: [router, amountIn] });
      return;
    }

    if (buying) {
      writeContract({
        address: router,
        abi: crateRouterAbi,
        functionName: "buy",
        args: [minimumOut, deadline()],
        value: amountIn,
      });
    } else {
      writeContract({
        address: router,
        abi: crateRouterAbi,
        functionName: "sell",
        args: [amountIn, minimumOut, deadline()],
      });
    }
  };

  const wrongChain = isConnected && chainId !== ROBINHOOD_CHAIN_ID;
  const busy = isPending || receipt.isLoading;

  const label = (() => {
    if (!isConnected) return "Connect a wallet";
    if (wrongChain) return "Switch to Robinhood Chain";
    if (!hasAmount) return "Enter an amount";
    if (overBalance) return `Not enough ${buying ? "ETH" : TICKER}`;
    if (busy) return receipt.isLoading ? "Confirming…" : "Check your wallet…";
    if (needsApproval) return `Approve ${TICKER}`;
    if (quote.isLoading) return "Pricing…";
    if (amountOut === 0n) return "No price";
    return buying ? `Buy ${TICKER}` : `Sell ${TICKER}`;
  })();

  const blocked = !isConnected || wrongChain || !hasAmount || overBalance || busy || (!needsApproval && amountOut === 0n);

  return (
    <div className="board overflow-hidden">
      <div className="grid grid-cols-2 border-b border-[var(--line-strong)]">
        {(["buy", "sell"] as const).map((option) => (
          <button
            key={option}
            onClick={() => {
              setMode(option);
              setInput("");
            }}
            className={`stencil py-3 text-sm transition ${
              mode === option ? "bg-[var(--paper-deep)] text-ink" : "text-ink-soft hover:text-ink"
            }`}
          >
            {option}
          </button>
        ))}
      </div>

      <div className="space-y-4 p-5 sm:p-6">
        <label className="block">
          <div className="mb-2 flex items-baseline justify-between">
            <span className="stencil text-[11px] text-ink-soft">You pay</span>
            <button
              type="button"
              onClick={() => setInput(buying ? formatEthAmount(balance) : formatAmount(balance))}
              className="numeric text-[11px] text-ink-soft underline-offset-2 hover:underline"
            >
              {buying ? formatEthAmount(balance) : formatAmount(balance)} {buying ? "ETH" : TICKER}
            </button>
          </div>
          <div className="flex items-center gap-3 rounded-[3px] border border-[var(--line-strong)] bg-[var(--paper-deep)] px-4 py-3">
            <input
              type="text"
              inputMode="decimal"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="0"
              className="w-full bg-transparent text-2xl outline-none placeholder:text-ink-soft/50"
            />
            <span className="stencil shrink-0 text-sm text-ink-soft">{buying ? "ETH" : TICKER}</span>
          </div>
        </label>

        <div>
          <div className="mb-2 stencil text-[11px] text-ink-soft">You receive</div>
          <div className="flex items-center gap-3 rounded-[3px] border border-dashed border-[var(--line-strong)] px-4 py-3">
            <span className="numeric w-full truncate text-2xl">
              {quote.isLoading && hasAmount
                ? "…"
                : amountOut === 0n
                  ? "0"
                  : buying
                    ? formatAmount(amountOut)
                    : formatEthAmount(amountOut)}
            </span>
            <span className="stencil shrink-0 text-sm text-ink-soft">{buying ? TICKER : "ETH"}</span>
          </div>
        </div>

        <div className="flex items-center justify-between gap-4">
          <span className="stencil text-[11px] text-ink-soft">Max slippage</span>
          <div className="flex gap-1">
            {SLIPPAGE_CHOICES.map((choice) => (
              <button
                key={choice}
                onClick={() => setSlippage(choice)}
                className={`numeric rounded-[3px] border px-2.5 py-1 text-xs transition ${
                  slippage === choice
                    ? "border-[var(--seal)] text-[var(--seal)]"
                    : "border-[var(--line)] text-ink-soft hover:text-ink"
                }`}
              >
                {choice}%
              </button>
            ))}
          </div>
        </div>

        {amountOut > 0n && (
          <p className="numeric text-xs text-ink-soft">
            At worst you get {buying ? formatAmount(minimumOut) : formatEthAmount(minimumOut)}{" "}
            {buying ? TICKER : "ETH"}. Below that, or after {DEADLINE_MINUTES} minutes, the trade reverts instead.
          </p>
        )}

        <Button tone="seal" className="w-full" onClick={submit} disabled={blocked}>
          {label}
        </Button>

        {writeError && (
          <p className="text-xs text-[var(--seal)]">
            {(writeError as { shortMessage?: string }).shortMessage ?? "The wallet rejected that."}
          </p>
        )}

        {hash && (
          <p className="numeric text-xs text-ink-soft">
            {receipt.isSuccess ? "Done. " : "Sent. "}
            <a href={explorerTx(hash)} target="_blank" rel="noreferrer" className="underline underline-offset-2">
              View transaction ↗
            </a>
          </p>
        )}
      </div>
    </div>
  );
}
