"use client";

import { useState } from "react";
import { clsx } from "@/lib/clsx";

/**
 * Notice art is a URL supplied by whoever posted it, so it points at hosts we
 * know nothing about. It is rendered with a plain img on purpose: routing
 * arbitrary third-party URLs through the image optimiser would make this server
 * fetch them. If the image fails, the ticker's monogram stands in.
 */
export function NoticeImage({ src, symbol, className }: { src: string; symbol: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  const usable = src.startsWith("https://") || src.startsWith("ipfs://") || src.startsWith("data:image/");

  if (!usable || failed) {
    return (
      <div
        className={clsx(
          "flex items-center justify-center border-2 border-ink bg-wood text-paper",
          className,
        )}
        aria-hidden
      >
        <span className="font-display text-lg">{symbol.slice(0, 3).toUpperCase()}</span>
      </div>
    );
  }

  const resolved = src.startsWith("ipfs://") ? `https://ipfs.io/ipfs/${src.slice("ipfs://".length)}` : src;

  return (
    // eslint-disable-next-line @next/next/no-img-element -- see note above
    <img
      src={resolved}
      alt=""
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={clsx("border-2 border-ink bg-paper-deep object-cover", className)}
    />
  );
}
