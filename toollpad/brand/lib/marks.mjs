// The Toollpad marks, drawn as pixels rather than set in a typeface.
//
// The wordmark is deliberately not text: a logo that depends on a webfont breaks
// the moment it is used somewhere the font is not loaded — an email, a print
// sheet, someone else's slide. These are rectangles, so they render anywhere an
// SVG renders, at any size, with no font file to ship.

export const PALETTE = {
  ground: "#161a21", // asphalt at night
  groundDeep: "#0b0e13",
  paper: "#f2efe6", // concrete
  paperDim: "#e4dfd0",
  paperDeep: "#d2ccb8",
  ink: "#14171d",
  inkSoft: "#5b626e",
  inkFaint: "#8e96a3",
  signal: "#f5c518", // the yellow every barrier in the world is painted
  signalDeep: "#c79a04",
  lane: "#eef1f6", // road marking white
  rust: "#c4552c",
};

const SIZE = 12;

/**
 * The gate: a post on the left, an arm across the middle, a base under it.
 *
 * A barrier is the one object that means "you are paying to go through this"
 * without a word on it, and at 16 pixels it is still a barrier — which is the
 * only test a profile picture has to pass.
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

/**
 * Where the stripes are cut. The arm's top and bottom rows are left alone: they
 * are the rails that hold it together, and without them the stripes cut the arm
 * into loose blocks that read as anything but a barrier.
 */
const ARM = { x0: 5, x1: 11, y0: 4, y1: 5 };

/**
 * The hazard stripes, knocked back out of the arm.
 *
 * Generated rather than drawn, because a diagonal is the one thing a hand-typed
 * pixel grid always gets slightly wrong: every cell where `(x + y) % 4` falls in
 * the first half is cut, which staggers the bands the way a painted barrier
 * does, at any size.
 */
function armStripes() {
  const rows = [];
  for (let y = 0; y < SIZE; y++) {
    let row = "";
    for (let x = 0; x < SIZE; x++) {
      const inArm = x >= ARM.x0 && x <= ARM.x1 && y >= ARM.y0 && y <= ARM.y1;
      row += inArm && (x - ARM.x0 + (y - ARM.y0)) % 4 < 2 ? "#" : ".";
    }
    rows.push(row);
  }
  return rows;
}

const STRIPES = armStripes();

/** 7 x 9 glyphs with two-pixel strokes — only the letters TOOLLPAD needs. */
const GLYPHS = {
  T: ["#######", "..##...", "..##...", "..##...", "..##...", "..##...", "..##...", "..##...", "..##..."],
  O: [".#####.", "##...##", "##...##", "##...##", "##...##", "##...##", "##...##", "##...##", ".#####."],
  L: ["##.....", "##.....", "##.....", "##.....", "##.....", "##.....", "##.....", "##.....", "#######"],
  P: ["######.", "##...##", "##...##", "##...##", "######.", "##.....", "##.....", "##.....", "##....."],
  A: ["..###..", ".##.##.", "##...##", "##...##", "#######", "##...##", "##...##", "##...##", "##...##"],
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

/** The gate, struck on a disc, with a margin so it reads as a coin and not a crop. */
export function gateSvg({ size = 512, disc = PALETTE.signal, ink = PALETTE.ink, pad = 2 } = {}) {
  const span = SIZE + pad * 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${span} ${span}" width="${size}" height="${size}" shape-rendering="crispEdges">
  <circle cx="${span / 2}" cy="${span / 2}" r="${span / 2}" fill="${disc}"/>
  ${rects(GATE, ink, pad, pad)}
  ${rects(STRIPES, disc, pad, pad)}
</svg>`;
}

/** The gate alone, no disc — for placing on a colour that is already the disc. */
export function gateBodySvg({ ink = PALETTE.ink, knockout = PALETTE.signal, pad = 2 } = {}) {
  return `${rects(GATE, ink, pad, pad)}${rects(STRIPES, knockout, pad, pad)}`;
}

function wordGrid(text) {
  const letters = [...text.toUpperCase()];
  const missing = letters.filter((letter) => !GLYPHS[letter]);
  if (missing.length > 0) throw new Error(`no pixel glyph for: ${[...new Set(missing)].join(", ")}`);
  return letters;
}

export function wordmarkSvg({ text = "TOOLLPAD", unit = 8, color = PALETTE.ink } = {}) {
  const letters = wordGrid(text);
  const pitch = GLYPH_WIDTH + LETTER_GAP;
  const width = letters.length * pitch - LETTER_GAP;
  const body = letters.map((letter, index) => rects(GLYPHS[letter], color, index * pitch, 0)).join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${GLYPH_HEIGHT}" width="${width * unit}" height="${GLYPH_HEIGHT * unit}" shape-rendering="crispEdges">${body}</svg>`;
}

/** Mark and wordmark side by side, the way a header uses them. */
export function lockupSvg({ unit = 8, color = PALETTE.ink, disc = PALETTE.signal } = {}) {
  const letters = wordGrid("TOOLLPAD");
  const pitch = GLYPH_WIDTH + LETTER_GAP;
  const wordWidth = letters.length * pitch - LETTER_GAP;
  const mark = SIZE + 4;
  const gap = 5;
  const width = mark + gap + wordWidth;

  const body = letters.map((letter, index) => rects(GLYPHS[letter], color, index * pitch, 0)).join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${mark}" width="${width * unit}" height="${mark * unit}" shape-rendering="crispEdges">
  <circle cx="${mark / 2}" cy="${mark / 2}" r="${mark / 2}" fill="${disc}"/>
  ${rects(GATE, color, 2, 2)}
  ${rects(STRIPES, disc, 2, 2)}
  <g transform="translate(${mark + gap}, ${(mark - GLYPH_HEIGHT) / 2})">${body}</g>
</svg>`;
}
