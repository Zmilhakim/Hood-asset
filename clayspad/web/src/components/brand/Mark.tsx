/**
 * The mark, as geometry rather than an image file.
 *
 * A simplified drawing of the logo: the C, the spire standing inside it, and
 * the one seam that glows. Inline SVG, so the header needs no image request and
 * stays sharp at any size — the rendered version is used for the profile
 * picture and the link preview, where a 3D render belongs.
 */
export function Mark({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      {/* The C: an arc left open to the right, the way the logo has it. */}
      <path d="M34 11.5A17 17 0 1 0 34 36.5" stroke="currentColor" strokeWidth="6.5" strokeLinecap="round" />
      {/* The spire standing in the opening, with fins at its base. */}
      <path d="M24 9 L27.5 17.5 L27.5 34 L20.5 34 L20.5 17.5 Z" fill="currentColor" />
      <path d="M20.5 26 L16 34 L20.5 34 Z M27.5 26 L32 34 L27.5 34 Z" fill="currentColor" />
      {/* The seam. The only part of the mark that glows. */}
      <line x1="24" y1="13" x2="24" y2="33" stroke="var(--color-signal)" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

/** Mark and wordmark, the way the header uses them. */
export function Lockup({ className }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className ?? ""}`}>
      <Mark size={26} className="text-clay-light" />
      <span className="font-display text-lg font-bold tracking-[0.2em] text-paper">CLAYSPAD</span>
    </span>
  );
}
