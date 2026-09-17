"use client";

import { useState } from "react";
import { TOKEN_ADDRESS } from "@/lib/addresses";

/** The contract address, in the one place people look for it, with the copy
 *  button that stops them retyping it wrong. */
export function Contract() {
  const [copied, setCopied] = useState(false);
  const address = TOKEN_ADDRESS;

  const copy = async () => {
    if (!address) return;
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="ca">
      <span className="lab">CA</span>
      <code>{address ?? "Posted here at launch"}</code>
      <button type="button" onClick={copy} disabled={!address}>
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}
