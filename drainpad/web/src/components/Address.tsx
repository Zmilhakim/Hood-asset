"use client";

import { useState } from "react";

import { explorerAddress } from "@/lib/chain";
import { cx } from "@/lib/cx";
import { shortAddress } from "@/lib/site";

/**
 * An address, in full where there is room and shortened where there is not,
 * with the two things anybody actually wants to do with one: copy it, or open
 * it on the explorer and read the source for themselves.
 */
export function Address({
  value,
  label,
  short = false,
  className,
}: {
  value: string;
  label?: string;
  short?: boolean;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className={cx("flex flex-wrap items-center gap-x-3 gap-y-1", className)}>
      {label ? <span className="stencil-dim">{label}</span> : null}
      <a
        href={explorerAddress(value)}
        target="_blank"
        rel="noreferrer"
        className="figure break-all text-sm text-chalk underline decoration-kerb-bright underline-offset-4 transition-colors hover:decoration-paint"
      >
        {short ? shortAddress(value, 10, 8) : value}
      </a>
      <button
        type="button"
        onClick={copy}
        className="stencil-dim transition-colors hover:text-paint"
        aria-label={`Copy ${value}`}
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}
