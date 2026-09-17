// Checks X-POSTS.md before any of it is posted, in the two ways it can be wrong.
//
// It measures every fenced block the way X does: Unicode code points, not bytes
// and not JavaScript's UTF-16 units. An em dash is one character to X and two to
// `String.length`, which is how copy that "fits" arrives 3 over.
//
// And it checks every address in the file against the deployment, because the
// worse failure is silent. A post three characters long is a post you rewrite;
// a post with one character wrong in the CA sends people to a different token,
// stays up, and gets screenshotted.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const markdown = readFileSync(join(here, "X-POSTS.md"), "utf8");
const config = JSON.parse(readFileSync(join(here, "..", "contracts", "crate.config.json"), "utf8"));

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
    // at the worst possible moment. A link X counts as 23 whatever its length,
    // and that includes its path: the explorer link to the seal is 62
    // characters of which X charges for 23, so counting the path would trim
    // copy that already fits.
    const counted = text
      .replace(/0x…/g, "0x".padEnd(42, "0"))
      .replace(/https?:\/\/\S+|\b[\w-]+(?:\.[\w-]+)*\.(?:fun|site|com)(?:\/\S*)?/g, "x".repeat(23));
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

// Everything the launch legitimately names. An address in the copy that is not
// one of these is either a typo or a contract from some other project, and
// there is no third possibility worth allowing through.
const known = new Map(
  Object.entries({
    token: config.deployed?.token,
    seal: config.deployed?.seal,
    router: config.deployed?.router,
    packer: config.deployed?.packer,
    deployer: config.deployer,
    treasury: config.treasury,
    poolManager: config.poolManager,
  })
    .filter(([, address]) => address)
    .map(([name, address]) => [address.toLowerCase(), { name, address }]),
);

let wrong = 0;
for (const address of new Set(markdown.match(/0x[0-9a-fA-F]{40}/g) ?? [])) {
  const entry = known.get(address.toLowerCase());

  // The comparison is against the config's own spelling, character for
  // character. That is stronger than recomputing a checksum and needs nothing
  // to do it with: an address that survives this is the one that was deployed,
  // in the form the rest of the repository writes it.
  if (!entry) {
    console.log(`  UNKNOWN   ${address} is not any address this launch deployed`);
    wrong += 1;
  } else if (address !== entry.address) {
    console.log(`  CASE      ${address} should be written ${entry.address} (${entry.name})`);
    wrong += 1;
  } else {
    console.log(`  ok        ${address}  ${entry.name}`);
  }
}

if (wrong > 0) {
  console.log("");
  console.log(`  ${wrong} address(es) in the copy are wrong. Do not post any of it until this is clean.`);
  process.exit(1);
}
