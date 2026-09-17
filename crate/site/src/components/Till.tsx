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
import { ROUTER_ADDRESS, TICKER, TOKEN_ADDRESS, V4_QUOTER } from "@/lib/addresses";
import { ROBINHOOD_CHAIN_ID, explorerTx } from "@/lib/chain";
import { applySlippage, formatAmount, formatEthAmount, parseAmount } from "@/lib/format";
import { cratePoolKey, erc20Abi, quoterAbi } from "@/lib/pool";
import { crateRouterAbi } from "@/lib/abi/crateRouter";

const SLIPPAGE_CHOICES = [0.5, 2, 5] as const;
const DEADLINE_MINUTES = 20;

type Mode = "buy" | "sell";

/** The till on the dock: where ETH is handed over and CRATE is handed back. */
export function Till() {
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

  // The quote comes from Uniswap's own V4Quoter rather than arithmetic here. It
  // is not a view function, but eth_call runs it happily, and it walks the same
  // tick math the swap will.
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
    if (wrongChain) return "Wrong chain";
    if (!hasAmount) return "Enter an amount";
    if (overBalance) return `Not enough ${buying ? "ETH" : TICKER}`;
    if (busy) return receipt.isLoading ? "Confirming" : "Check wallet";
    if (needsApproval) return `Approve ${TICKER}`;
    if (quote.isLoading) return "Pricing";
    if (amountOut === 0n) return "No price";
    return buying ? `Buy ${TICKER}` : `Sell ${TICKER}`;
  })();

  const blocked =
    !isConnected || wrongChain || !hasAmount || overBalance || busy || (!needsApproval && amountOut === 0n);

  return (
    <div className="till">
      <div className="till-head" role="tablist" aria-label="Buy or sell">
        {(["buy", "sell"] as const).map((option) => (
          <button
            key={option}
            role="tab"
            aria-selected={mode === option}
            onClick={() => {
              setMode(option);
              setInput("");
            }}
          >
            {option}
          </button>
        ))}
      </div>

      <div className="till-body">
        <div>
          <div className="field-head">
            <span className="lbl">You pay</span>
            <button
              type="button"
              onClick={() => setInput(buying ? formatEthAmount(balance) : formatAmount(balance))}
              className="maxbtn"
            >
              {buying ? formatEthAmount(balance) : formatAmount(balance)} {buying ? "ETH" : TICKER}
            </button>
          </div>
          <label className="field">
            <input
              type="text"
              inputMode="decimal"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="0"
              aria-label={`Amount of ${buying ? "ETH" : TICKER} to pay`}
            />
            <span className="unit">{buying ? "ETH" : TICKER}</span>
          </label>
        </div>

        <div>
          <div className="lbl" style={{ marginBottom: 6 }}>
            You receive
          </div>
          <div className="field ghost">
            <span style={{ fontWeight: 700, fontSize: 24, overflow: "hidden", textOverflow: "ellipsis", width: "100%" }}>
              {quote.isLoading && hasAmount
                ? "…"
                : amountOut === 0n
                  ? "0"
                  : buying
                    ? formatAmount(amountOut)
                    : formatEthAmount(amountOut)}
            </span>
            <span className="unit">{buying ? TICKER : "ETH"}</span>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <span className="lbl">Max slippage</span>
          <div style={{ display: "flex", gap: 6 }}>
            {SLIPPAGE_CHOICES.map((choice) => (
              <button key={choice} className="chip" aria-pressed={slippage === choice} onClick={() => setSlippage(choice)}>
                {choice}%
              </button>
            ))}
          </div>
        </div>

        {amountOut > 0n && (
          <p className="till-note">
            At worst you get {buying ? formatAmount(minimumOut) : formatEthAmount(minimumOut)}{" "}
            {buying ? TICKER : "ETH"}. Below that, or after {DEADLINE_MINUTES} minutes, the trade reverts instead.
          </p>
        )}

        <button className="btn" style={{ width: "100%" }} onClick={submit} disabled={blocked}>
          {label}
        </button>

        {writeError && (
          <p style={{ fontSize: 14, color: "var(--red-deep)" }}>
            {(writeError as { shortMessage?: string }).shortMessage ?? "The wallet rejected that."}
          </p>
        )}

        {hash && (
          <p style={{ fontSize: 14 }}>
            {receipt.isSuccess ? "Done. " : "Sent. "}
            <a href={explorerTx(hash)} target="_blank" rel="noreferrer">
              View transaction
            </a>
          </p>
        )}
      </div>
    </div>
  );
}

/** What stands in the till's place before there is anything to sell. */
export function TillClosed() {
  return (
    <div className="till">
      <div style={{ padding: "28px 22px", textAlign: "center" }}>
        <p className="stencil" style={{ fontSize: 30, marginBottom: 10 }}>
          Till closed
        </p>
        <p style={{ fontSize: 15.5, color: "var(--ink-soft)" }}>
          The crate has not been sealed, so there is nothing to buy and no price to quote. This page will not
          pretend otherwise — the moment the pool exists it reads it straight from the chain.
        </p>
      </div>
    </div>
  );
}
