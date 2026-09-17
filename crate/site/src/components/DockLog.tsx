"use client";

import { useEffect, useState } from "react";
import { LAUNCHED, TOKEN_ADDRESS } from "@/lib/addresses";
import { DEFAULT_EXPLORER_URL } from "@/lib/chain";
import { shortAddress } from "@/lib/format";

type Transfer = {
  when: string;
  from: string;
  to: string;
  amount: string;
  tx: string;
};

const ago = (iso: string) => {
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return `${Math.floor(seconds)}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86_400)}d ago`;
};

const compact = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 2 });

/**
 * Who has been handed a crate, most recent first.
 *
 * This is the one panel that does not come from the chain directly: an
 * event history is a bad fit for a browser over a public RPC, so it comes
 * from Blockscout, the chain's own explorer. Every figure elsewhere on the
 * page is read from the pool manager — this is history, not arithmetic, and
 * the difference is worth saying out loud rather than blurring.
 */
export function DockLog() {
  const [rows, setRows] = useState<Transfer[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!LAUNCHED || !TOKEN_ADDRESS) return;

    let live = true;
    const load = async () => {
      try {
        const response = await fetch(`${DEFAULT_EXPLORER_URL}/api/v2/tokens/${TOKEN_ADDRESS}/transfers`, {
          headers: { accept: "application/json" },
        });
        if (!response.ok) throw new Error(String(response.status));
        const body = await response.json();

        if (!live) return;
        setFailed(false);
        setRows(
          (body.items ?? []).slice(0, 15).map((item: Record<string, never>) => {
            const total = item.total as { value?: string; decimals?: string } | undefined;
            const decimals = Number(total?.decimals ?? 18);
            const value = total?.value ? Number(BigInt(total.value) / 10n ** BigInt(Math.max(0, decimals - 6))) / 1e6 : null;
            return {
              when: item.timestamp ? ago(item.timestamp as unknown as string) : "",
              from: (item.from as { hash?: string } | undefined)?.hash ?? "",
              to: (item.to as { hash?: string } | undefined)?.hash ?? "",
              amount: value === null ? "" : compact.format(value),
              tx: (item.transaction_hash ?? item.tx_hash ?? "") as unknown as string,
            };
          }),
        );
      } catch {
        if (live) setFailed(true);
      }
    };

    load();
    const timer = setInterval(load, 20_000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, []);

  if (!LAUNCHED) {
    return (
      <div className="empty">
        <b>The dock opens soon</b>
        <p>$CRATE is not trading on Robinhood Chain yet. The first shipment is logged here the moment it is.</p>
      </div>
    );
  }

  if (failed) {
    return (
      <div className="empty">
        <b>Log not readable</b>
        <p>The explorer did not answer. The page tries again in twenty seconds. The figures above do not depend on it.</p>
      </div>
    );
  }

  if (rows === null) {
    return (
      <div className="empty">
        <b>Reading the log</b>
        <p>Asking the explorer what has shipped.</p>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="empty">
        <b>Nothing shipped yet</b>
        <p>The crate is sealed and the pool is open. The first transfer is logged here the moment it happens.</p>
      </div>
    );
  }

  return (
    <div className="scroll">
      <table className="log">
        <thead>
          <tr>
            <th>When</th>
            <th>From</th>
            <th className="to">To</th>
            <th className="num">$CRATE</th>
            <th>Tx</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.tx + row.from + row.when}>
              <td>{row.when}</td>
              <td>
                <a href={`${DEFAULT_EXPLORER_URL}/address/${row.from}`} target="_blank" rel="noreferrer">
                  {shortAddress(row.from)}
                </a>
              </td>
              <td className="to">
                <a href={`${DEFAULT_EXPLORER_URL}/address/${row.to}`} target="_blank" rel="noreferrer">
                  {shortAddress(row.to)}
                </a>
              </td>
              <td className="num">{row.amount}</td>
              <td>
                <a href={`${DEFAULT_EXPLORER_URL}/tx/${row.tx}`} target="_blank" rel="noreferrer">
                  {shortAddress(row.tx)}
                </a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
