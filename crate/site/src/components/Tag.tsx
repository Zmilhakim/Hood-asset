"use client";

import { LAUNCHED, SUPPLY, TICKER } from "@/lib/addresses";
import { useCrate } from "@/lib/crate";
import { formatEthAmount } from "@/lib/format";

const eth = (value: number) =>
  value === 0 ? "n/a" : value >= 0.01 ? `${value.toLocaleString("en-US", { maximumFractionDigits: 2 })} ETH` : `${value.toExponential(2)} ETH`;

/** The manila tag wired to the crate: the live figures, and only the live ones. */
export function Tag() {
  const crate = useCrate();
  const priced = LAUNCHED && crate.initialized;

  return (
    <div className="tagwrap">
      <span className="twine" aria-hidden />
      <div className="tagshadow">
        <div className="tag">
          <span className="hole" aria-hidden />
          <h2>Manifest, live</h2>
          <ul className="rows">
            <li>
              <span className="k">Price</span>
              <span className="lead" />
              <span className="v">{priced ? `${crate.price.toExponential(2)} ETH` : "n/a"}</span>
            </li>
            <li>
              <span className="k">Valuation</span>
              <span className="lead" />
              <span className="v">{priced ? eth(crate.marketCap) : "n/a"}</span>
            </li>
            <li>
              <span className="k">Supply</span>
              <span className="lead" />
              <span className="v">{SUPPLY.toLocaleString("en-US")}</span>
            </li>
            <li>
              <span className="k">ETH sealed in</span>
              <span className="lead" />
              <span className="v">
                {crate.ethLocked === null ? "n/a" : `${formatEthAmount(crate.ethLocked)} ETH`}
              </span>
            </li>
            <li>
              <span className="k">Opened</span>
              <span className="lead" />
              <span className="v">Never</span>
            </li>
          </ul>
          <p className="note">
            Sealed once.
            <br />
            Never reopened.
          </p>
          <span className="stamp" aria-hidden>
            Sealed
          </span>
        </div>
      </div>
      <span className="sr-only">{TICKER}</span>
    </div>
  );
}
