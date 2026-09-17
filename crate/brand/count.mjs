// Measures every fenced block in X-POSTS.md the way X does: Unicode code
// points, not bytes and not JavaScript's UTF-16 units. An em dash is one
// character to X and two to `String.length`, which is how copy that "fits"
// arrives 3 over.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const markdown = readFileSync(join(here, "X-POSTS.md"), "utf8");

const LIMIT = 280;
const lines = markdown.split("\n");

let inBlock = false;
let heading = "";
let label = "";
let buffer = [];
let over = 0;

for (const line of lines) {
  if (line.startsWith("## ")) heading = line.slice(3);
  if (/^\*\*.+\*\*/.test(line) && !inBlock) label = line.replace(/\*\*/g, "").replace(/ —$/, "");

  if (line.trim() === "```") {
    if (!inBlock) {
      inBlock = true;
      buffer = [];
      continue;
    }

    inBlock = false;
    const text = buffer.join("\n").trim();

    // Two substitutions, because the draft is shorter than the post will be.
    // A contract address placeholder is four characters and the real thing is
    // forty-two — measuring the placeholder is how copy that "fits" goes over
    // at the worst possible moment. A link X counts as 23 whatever its length.
    const counted = text
      .replace(/0x…/g, "0x".padEnd(42, "0"))
      .replace(/https?:\/\/\S+|\b\S+\.(fun|site|com)\b/g, "x".repeat(23));
    const length = [...counted].length;

    const flag = length > LIMIT ? "OVER" : "ok";
    if (length > LIMIT) over += 1;
    console.log(
      `${String(length).padStart(4)} ${flag.padEnd(5)} ${heading.slice(0, 22).padEnd(24)} ${label.slice(0, 28)}`,
    );
    label = "";
    continue;
  }

  if (inBlock) buffer.push(line);
}

console.log("");
console.log(over === 0 ? `All blocks fit in ${LIMIT}.` : `${over} block(s) over ${LIMIT} — trim before posting.`);
