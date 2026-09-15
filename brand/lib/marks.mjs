// The Hoodpad marks, drawn as pixels rather than set in a typeface.
//
// The wordmark is deliberately not text: a logo that depends on a webfont
// breaks the moment it is used where the font is not loaded — an email, a
// print sheet, someone else's slide. These are rectangles, so they render
// anywhere an SVG renders, at any size, with no font file to ship.

export const PALETTE = {
  ground: "#14301e",
  groundDeep: "#0d2014",
  paper: "#f1e7ce",
  paperDim: "#e2d5b4",
  paperDeep: "#d2c197",
  ink: "#21170e",
  inkSoft: "#6d5c43",
  inkFaint: "#9b8a6e",
  flame: "#e3762a",
  flameDeep: "#b85b18",
  wood: "#6b4321",
  moss: "#5c7a55",
};

/**
 * The cowl: a hooded figure, 12 x 12. Solid on purpose — an outlined hood
 * reads as a ring at small sizes, so the face is a small void in a filled
 * shape rather than a gap in a stroke.
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

/** 7 x 9 glyphs with two-pixel strokes — only the letters HOODPAD needs. */
const GLYPHS = {
  H: ["##...##", "##...##", "##...##", "##...##", "#######", "##...##", "##...##", "##...##", "##...##"],
  O: [".#####.", "##...##", "##...##", "##...##", "##...##", "##...##", "##...##", "##...##", ".#####."],
  D: ["#####..", "##..##.", "##...##", "##...##", "##...##", "##...##", "##...##", "##..##.", "#####.."],
  P: ["######.", "##...##", "##...##", "##...##", "######.", "##.....", "##.....", "##.....", "##....."],
  A: ["..###..", ".##.##.", "##...##", "##...##", "#######", "##...##", "##...##", "##...##", "##...##"],
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

/** The coin: the cowl inset on a flame disc, with a margin so it reads as struck, not cropped. */
export function cowlSvg({ size = 512, disc = PALETTE.flame, ink = PALETTE.ink, pad = 2 } = {}) {
  const span = 12 + pad * 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${span} ${span}" width="${size}" height="${size}" shape-rendering="crispEdges">
  <circle cx="${span / 2}" cy="${span / 2}" r="${span / 2}" fill="${disc}"/>
  ${rects(COWL, ink, pad, pad)}
</svg>`;
}

function wordGrid(text) {
  const letters = [...text.toUpperCase()];
  const missing = letters.filter((letter) => !GLYPHS[letter]);
  if (missing.length > 0) throw new Error(`no pixel glyph for: ${[...new Set(missing)].join(", ")}`);
  return letters;
}

export function wordmarkSvg({ text = "HOODPAD", unit = 8, color = PALETTE.ink } = {}) {
  const letters = wordGrid(text);
  const pitch = GLYPH_WIDTH + LETTER_GAP;
  const width = letters.length * pitch - LETTER_GAP;
  const body = letters.map((letter, index) => rects(GLYPHS[letter], color, index * pitch, 0)).join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${GLYPH_HEIGHT}" width="${width * unit}" height="${GLYPH_HEIGHT * unit}" shape-rendering="crispEdges">${body}</svg>`;
}

/** Mark and wordmark side by side, the way the header uses them. */
export function lockupSvg({ unit = 8, color = PALETTE.ink, disc = PALETTE.flame } = {}) {
  const letters = wordGrid("HOODPAD");
  const pitch = GLYPH_WIDTH + LETTER_GAP;
  const wordWidth = letters.length * pitch - LETTER_GAP;
  const mark = 16;
  const gap = 5;
  const width = mark + gap + wordWidth;

  const body = letters.map((letter, index) => rects(GLYPHS[letter], color, index * pitch, 0)).join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${mark}" width="${width * unit}" height="${mark * unit}" shape-rendering="crispEdges">
  <circle cx="8" cy="8" r="8" fill="${disc}"/>
  ${rects(COWL, color, 2, 2)}
  <g transform="translate(${mark + gap}, ${(mark - GLYPH_HEIGHT) / 2})">${body}</g>
</svg>`;
}
