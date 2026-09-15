/**
 * The Hoodpad mark: a solid pixel cowl struck on a flame coin.
 *
 * Kept in sync with brand/lib/marks.mjs, which renders the same grid into the
 * logo files, the avatar and the social banner — the header and the banner have
 * to be the same logo.
 */
const COWL = [
  "....####....",
  "..########..",
  ".##########.",
  "############",
  "####....####",
  "####....####",
  "####....####",
  "####....####",
  "############",
  ".##########.",
  ".###....###.",
  ".###....###.",
];

const PAD = 2;
const SPAN = 12 + PAD * 2;

export function Mark({ size = 34, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${SPAN} ${SPAN}`}
      role="img"
      aria-label="Hoodpad"
      className={className}
      shapeRendering="crispEdges"
    >
      <circle cx={SPAN / 2} cy={SPAN / 2} r={SPAN / 2} fill="var(--color-flame)" />
      {COWL.flatMap((row, y) =>
        [...row].map((cell, x) =>
          cell === "#" ? (
            <rect key={`${x}-${y}`} x={x + PAD} y={y + PAD} width="1" height="1" fill="var(--color-ink)" />
          ) : null,
        ),
      )}
    </svg>
  );
}
