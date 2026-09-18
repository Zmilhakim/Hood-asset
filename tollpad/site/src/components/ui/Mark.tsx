/**
 * The gate, as pixels.
 *
 * The same grid as brand/lib/marks.mjs, duplicated here so the header can tint
 * it with CSS instead of loading an SVG file it cannot recolour. If the gate
 * changes, change both — there is a test for neither, so this comment is the
 * whole of the enforcement.
 */
const GATE = [
  "............",
  ".###........",
  ".###........",
  ".###########",
  ".###########",
  ".###########",
  ".###########",
  ".###........",
  ".###........",
  ".###........",
  "#####.......",
  "#######.....",
];

/** The arm's two middle rows, where the hazard stripes are cut. */
const ARM = { x0: 5, x1: 11, y0: 4, y1: 5 };

function rects(grid: string[], fill: string, pad: number, key: string) {
  const out: React.ReactElement[] = [];
  grid.forEach((row, y) => {
    let run = 0;
    [...row].forEach((cell, x) => {
      if (cell === "#") {
        run += 1;
        return;
      }
      if (run > 0) {
        out.push(<rect key={`${key}-${x}-${y}`} x={pad + x - run} y={pad + y} width={run} height={1} fill={fill} />);
        run = 0;
      }
    });
    if (run > 0) {
      out.push(
        <rect key={`${key}-end-${y}`} x={pad + row.length - run} y={pad + y} width={run} height={1} fill={fill} />,
      );
    }
  });
  return out;
}

const STRIPES = Array.from({ length: 12 }, (_, y) =>
  Array.from({ length: 12 }, (_, x) => {
    const inArm = x >= ARM.x0 && x <= ARM.x1 && y >= ARM.y0 && y <= ARM.y1;
    return inArm && (x - ARM.x0 + (y - ARM.y0)) % 4 < 2 ? "#" : ".";
  }).join(""),
);

export function Mark({ size = 32, className }: { size?: number; className?: string }) {
  const pad = 2;
  const span = 12 + pad * 2;

  return (
    <svg
      viewBox={`0 0 ${span} ${span}`}
      width={size}
      height={size}
      shapeRendering="crispEdges"
      className={className}
      aria-hidden="true"
    >
      <circle cx={span / 2} cy={span / 2} r={span / 2} className="fill-signal" />
      {rects(GATE, "currentColor", pad, "gate")}
      {/* Knocked back out in the disc's colour, so the stripes are holes rather
          than paint — which is what keeps them right on any background. */}
      <g className="fill-signal">{rects(STRIPES, "currentColor", pad, "stripe").map((r) => r)}</g>
    </svg>
  );
}
