/**
 * The Hoodpad mark: a pixel cowl, punched out of a flame-orange coin.
 * Drawn as rects on a 12-unit grid so it stays crisp at favicon size.
 */
const COWL = [
  "....####....",
  "..##....##..",
  ".##......##.",
  "##........##",
  "##........##",
  "##........##",
  "##........##",
  "##........##",
  ".##......##.",
  ".##......##.",
  "##........##",
  "##........##",
];

export function Mark({ size = 34, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 12 12"
      role="img"
      aria-label="Hoodpad"
      className={className}
      shapeRendering="crispEdges"
    >
      <circle cx="6" cy="6" r="6" fill="var(--color-flame)" />
      {COWL.flatMap((row, y) =>
        [...row].map((cell, x) =>
          cell === "#" ? <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" fill="var(--color-ink)" /> : null,
        ),
      )}
    </svg>
  );
}
