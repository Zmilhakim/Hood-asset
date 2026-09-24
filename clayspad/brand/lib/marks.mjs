// The Clayspad marks, drawn as pixels rather than set in a typeface.
//
// The wordmark is deliberately not text: a logo that depends on a webfont breaks
// the moment it is used somewhere that font is not loaded — an email signature,
// a print sheet, someone else's slide. These are rectangles, so they render
// anywhere an SVG renders, at any size, with no font file to ship.

export const PALETTE = {
  ground: "#0B0E0D", // near-black, the background everything sits on
  groundDeep: "#060807",
  greenDeep: "#0E2B21", // the bloom behind a subject
  paper: "#F2F5F4", // off-white, never pure white
  paperDim: "#D7DCDA",
  ink: "#0B0E0D",
  clayLight: "#8D949C", // top surfaces catching the key light
  clay: "#565D65", // the body of the material
  clayDark: "#2B3037", // undersides, cavities, contact shadow
  signal: "#3FE08A", // neon green — the accent, and it is always emissive
  signalHot: "#A7F3C4", // the brightest point of a glow, and nothing else
  signalDeep: "#1E9E5E",
};

export const SIZE = 12;

/**
 * The urn: a lip, a neck, a belly, a foot. Fixed, because a pot is a pot.
 *
 * Drawn as a silhouette rather than as an outline with something inside it. At
 * sixteen pixels an outlined vessel and its contents are the same colour and
 * merge into one blob, so the shape has to carry the read on its own — and this
 * one does: lip, neck, shoulder, belly, foot, in twelve rows.
 */
const URN = [
  "..########..", // lip
  "..########..",
  "...######...", // neck
  "..########..", // shoulder
  ".##########.", // belly
  ".##########.",
  ".##########.",
  ".##########.",
  ".##########.",
  ".##########.",
  "..########..", // taper
  "...######...", // foot
];

export function potGrid() {
  return URN;
}

/**
 * The level, knocked back out of the urn at the row the fill reaches.
 *
 * `fillRows` is not a design choice. The caller computes it from `POOL_BPS` in
 * `Clayspad.sol` — the share of every supply that goes into the pool — so the
 * mark is a picture of the split rather than an illustration of it. Change the
 * constant in the contract and this line moves; nobody has to remember to
 * redraw it, and it cannot quietly disagree with the code.
 *
 * Solid below the line is the share fired into the pool, which does not come
 * back out. Everything above it is the share minted to the supply wallet,
 * liquid from the first block. That is the whole product, in one row of pixels.
 *
 * The outer two cells of the row are left alone whatever width it is: they are
 * the vessel's walls, and knocking them out too cuts the pot in half rather
 * than drawing a line inside it.
 */
export function surfaceGrid(fillRows) {
  if (!Number.isInteger(fillRows) || fillRows < 3 || fillRows > SIZE - 1) {
    throw new RangeError(`a pot filled to ${fillRows} of ${SIZE} rows is not a pot`);
  }

  const fillTop = SIZE - fillRows;
  return URN.map((row, y) => {
    if (y !== fillTop) return ".".repeat(SIZE);

    const first = row.indexOf("#");
    const last = row.lastIndexOf("#");
    return [...row]
      .map((_, x) => (x >= first + 2 && x <= last - 2 ? "#" : "."))
      .join("");
  });
}

/** 7 x 9 glyphs with two-pixel strokes — only the letters CLAYSPAD needs. */
const GLYPHS = {
  C: [".#####.", "##...##", "##...##", "##.....", "##.....", "##.....", "##...##", "##...##", ".#####."],
  L: ["##.....", "##.....", "##.....", "##.....", "##.....", "##.....", "##.....", "##.....", "#######"],
  A: ["..###..", ".##.##.", "##...##", "##...##", "#######", "##...##", "##...##", "##...##", "##...##"],
  Y: ["##...##", "##...##", "##...##", ".##.##.", "..###..", "..##...", "..##...", "..##...", "..##..."],
  S: [".#####.", "##...##", "##.....", "##.....", ".#####.", ".....##", ".....##", "##...##", ".#####."],
  P: ["######.", "##...##", "##...##", "##...##", "######.", "##.....", "##.....", "##.....", "##....."],
  D: ["#####..", "##..##.", "##...##", "##...##", "##...##", "##...##", "##...##", "##..##.", "#####.."],
};

const GLYPH_WIDTH = 7;
const GLYPH_HEIGHT = 9;
const LETTER_GAP = 2;

/** Runs of set pixels become one rect each, so the output stays small. */
function rects(grid, color, offsetX = 0, offsetY = 0) {
  const out = [];
  grid.forEach((row, y) => {
    let run = 0;
    [...row].forEach((cell, x) => {
      if (cell === "#") {
        run += 1;
        return;
      }
      if (run > 0) {
        out.push(`<rect x="${offsetX + x - run}" y="${offsetY + y}" width="${run}" height="1" fill="${color}"/>`);
        run = 0;
      }
    });
    if (run > 0) {
      out.push(
        `<rect x="${offsetX + row.length - run}" y="${offsetY + y}" width="${run}" height="1" fill="${color}"/>`,
      );
    }
  });
  return out.join("");
}

/**
 * The pot, struck on a disc, with a margin so it reads as a coin and not a crop.
 *
 * Three colours, and which is which matters: the disc is the near-black
 * background, the vessel is clay, and the level is the only thing that
 * glows. The green is never the vessel and never the ground — it is what comes
 * out of it.
 */
export function potSvg({
  fillRows,
  size = 512,
  disc = PALETTE.ground,
  ink = PALETTE.clay,
  level = PALETTE.signal,
  pad = 2,
} = {}) {
  const span = SIZE + pad * 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${span} ${span}" width="${size}" height="${size}" shape-rendering="crispEdges">
  <circle cx="${span / 2}" cy="${span / 2}" r="${span / 2}" fill="${disc}"/>
  ${rects(potGrid(), ink, pad, pad)}
  ${rects(surfaceGrid(fillRows), level, pad, pad)}
</svg>`;
}

/** The pot alone, no disc — for placing on a colour that is already the disc. */
export function potBodySvg({ fillRows, ink = PALETTE.clay, level = PALETTE.signal, pad = 2 } = {}) {
  return `${rects(potGrid(), ink, pad, pad)}${rects(surfaceGrid(fillRows), level, pad, pad)}`;
}

function wordGrid(text) {
  const letters = [...text.toUpperCase()];
  const missing = letters.filter((letter) => !GLYPHS[letter]);
  if (missing.length > 0) throw new Error(`no pixel glyph for: ${[...new Set(missing)].join(", ")}`);
  return letters;
}

export function wordmarkSvg({ text = "CLAYSPAD", unit = 8, color = PALETTE.ink } = {}) {
  const letters = wordGrid(text);
  const pitch = GLYPH_WIDTH + LETTER_GAP;
  const width = letters.length * pitch - LETTER_GAP;
  const body = letters.map((letter, index) => rects(GLYPHS[letter], color, index * pitch, 0)).join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${GLYPH_HEIGHT}" width="${width * unit}" height="${GLYPH_HEIGHT * unit}" shape-rendering="crispEdges">${body}</svg>`;
}

/** Mark and wordmark side by side, the way a header uses them. */
export function lockupSvg({
  fillRows,
  unit = 8,
  color = PALETTE.paper,
  vessel = PALETTE.clay,
  disc = PALETTE.ground,
  level = PALETTE.signal,
} = {}) {
  const letters = wordGrid("CLAYSPAD");
  const pitch = GLYPH_WIDTH + LETTER_GAP;
  const wordWidth = letters.length * pitch - LETTER_GAP;
  const mark = SIZE + 4;
  const gap = 5;
  const width = mark + gap + wordWidth;

  const body = letters.map((letter, index) => rects(GLYPHS[letter], color, index * pitch, 0)).join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${mark}" width="${width * unit}" height="${mark * unit}" shape-rendering="crispEdges">
  <circle cx="${mark / 2}" cy="${mark / 2}" r="${mark / 2}" fill="${disc}"/>
  ${rects(potGrid(), vessel, 2, 2)}
  ${rects(surfaceGrid(fillRows), level, 2, 2)}
  <g transform="translate(${mark + gap}, ${(mark - GLYPH_HEIGHT) / 2})">${body}</g>
</svg>`;
}
