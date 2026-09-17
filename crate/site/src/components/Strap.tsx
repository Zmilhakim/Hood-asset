"use client";

import { useBlockHeight } from "@/lib/crate";
import { ROBINHOOD_CHAIN_ID } from "@/lib/chain";

/** The steel band across the crate, carrying the one fact that proves the page
 *  is reading a live chain rather than a cached story about one. */
export function Strap() {
  const { height, live } = useBlockHeight();

  return (
    <div className="strap" role="status" aria-live="polite">
      <div className="wrap">
        <span className="buckle" aria-hidden />
        <span>
          <span className={`dot${live ? " live" : ""}`} />
          {height === null
            ? "Reading Robinhood Chain"
            : `Robinhood Chain, block ${height.toLocaleString("en-US")}`}
        </span>
        <span style={{ marginLeft: "auto", fontWeight: 400 }}>Chain ID {ROBINHOOD_CHAIN_ID}</span>
      </div>
    </div>
  );
}
