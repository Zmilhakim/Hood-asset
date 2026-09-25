// Counts a post the way X counts it: every URL is 23 characters whatever its
// real length, and everything else is one character each.
import { readFileSync } from "node:fs";

const URL_RE = /\bhttps?:\/\/\S+|\b[a-z0-9-]+\.(?:fun|com|org|io|xyz|app|net)\b\S*/gi;

export function weigh(text) {
  const trimmed = text.trim();
  const urls = trimmed.match(URL_RE) ?? [];
  let count = [...trimmed].length;
  for (const url of urls) count += 23 - [...url].length;
  return { count, urls };
}

const posts = JSON.parse(readFileSync(process.argv[2], "utf8"));
let worst = 0;
for (const [name, text] of Object.entries(posts)) {
  const { count, urls } = weigh(text);
  worst = Math.max(worst, count);
  const flag = count > 280 ? `OVER by ${count - 280}` : `${280 - count} left`;
  console.log(`${name.padEnd(10)} ${String(count).padStart(3)}  ${flag}${urls.length ? `  (urls: ${urls.join(", ")})` : ""}`);
}
console.log(worst > 280 ? "\nsome are over" : "\nall fit");
