// Generates the two fresh keys this project needs — on YOUR machine, never on a
// server.
//
//   cd crate/contracts && npm install && node new-wallets.mjs
//
// The keys are printed once and written nowhere. Nothing here phones home and
// nothing saves state; re-running gives completely new keys.
//
// Why this is a script you run rather than keys someone hands you: a private key
// is only secret while it has existed in exactly one place. A key pasted into a
// chat, an issue, a DM, a CI log or an AI session is not a secret any more, no
// matter who sent it or how quickly it was deleted.
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

const WALLETS = {
  deployer: {
    title: "DEPLOYER — deploys the packer, and is the only address that may pack",
    notes: [
      "Fund this with a little ETH on Robinhood Chain; it pays for two",
      "transactions and nothing else.",
      "",
      "It matters between `npm run deploy` and `npm run pack`, and only then.",
      "CratePacker records this address as `packer` and refuses `pack` from",
      "anyone else, so losing the key in that window means deploying a new",
      "packer. After the crate is packed this account holds no power at all —",
      "not over the token, not over the pool, not over the seal.",
    ],
  },
  treasury: {
    title: "TREASURY — receives the pool's trading fees, forever",
    notes: [
      "This address is written into CrateSeal as an immutable at deployment.",
      "No function anywhere changes it. A typo is a typo forever, and every fee",
      "the crate ever earns goes to whatever address it is.",
      "",
      "What it earns is the fee and only the fee: on a 1% pool, one ETH of",
      "buying pays it 0.01 ETH. The other 0.99 becomes liquidity, and liquidity",
      "never comes back out — not to this address, not to anyone.",
      "",
      "It never signs anything, so it should not be a hot key at all. Use a",
      "hardware wallet address here and skip the key below; generate one only",
      "if you have not got one yet.",
    ],
  },
};

// A generated key is only as private as the machine that generates it. These are
// the environments where "your machine" is provably not what is running.
const SHARED_MACHINE = [
  "CI",
  "GITHUB_ACTIONS",
  "GITLAB_CI",
  "BUILDKITE",
  "CIRCLECI",
  "JENKINS_URL",
  "CODESPACES",
  "GITPOD_WORKSPACE_ID",
  "REPL_ID",
  "CLOUD_SHELL",
].filter((name) => process.env[name]);

if (SHARED_MACHINE.length > 0 && process.env.I_AM_ON_MY_OWN_MACHINE !== "yes") {
  console.error(`refusing to run: this looks like a shared or hosted machine (${SHARED_MACHINE.join(", ")}).`);
  console.error("");
  console.error("A key generated here exists on somebody else's disk, in somebody else's");
  console.error("logs, and in whatever that environment backs up. Generate it on the");
  console.error("computer you actually sit in front of.");
  console.error("");
  console.error("If this really is your own machine and the variable is a false alarm:");
  console.error("");
  console.error("    I_AM_ON_MY_OWN_MACHINE=yes node new-wallets.mjs");
  process.exit(1);
}

if (!process.stdout.isTTY) {
  console.error("refusing to run: stdout is not a terminal.");
  console.error("");
  console.error("Piping or redirecting this means the keys land in a file, a log or");
  console.error("another program. Run it directly in your own terminal instead:");
  console.error("");
  console.error("    node new-wallets.mjs");
  process.exit(1);
}

const asked = process.argv.slice(2);
const unknown = asked.filter((name) => !(name in WALLETS));
if (unknown.length > 0) {
  console.error(`unknown wallet: ${unknown.join(", ")}`);
  console.error(`this script makes: ${Object.keys(WALLETS).join(", ")}`);
  process.exit(1);
}

const wanted = asked.length > 0 ? asked : Object.keys(WALLETS);

console.log("");
for (const name of wanted) {
  const { title, notes } = WALLETS[name];
  const privateKey = generatePrivateKey();
  const account = privateKeyToAccount(privateKey);

  console.log(`  ${title}`);
  console.log("");
  console.log(`  address      ${account.address}`);
  console.log(`  private key  ${privateKey}`);
  console.log("");
  for (const line of notes) console.log(line ? `  ${line}` : "");
  console.log("");
  console.log("  ──────────────────────────────────────────────────────────────────");
  console.log("");
}

console.log("  These are shown once. They are not saved anywhere.");
console.log("");
console.log("  1. Put each private key in a password manager. Not a note, not a chat.");
console.log("  2. Send them to nobody. Not to support, not to a teammate, not to an AI.");
console.log("  3. Check you stored the right thing before you rely on it:");
console.log("");
console.log("       DEPLOYER_KEY=0x… npm run whoami     # prints the address, never the key");
console.log("");
console.log("  4. Fund the deployer with ETH on Robinhood Chain, then:");
console.log("");
console.log("       export DEPLOYER_KEY=0x…   # in your own shell, not in a file");
console.log("       POOL_MANAGER=0x… TREASURY=0x… npm run deploy");
console.log("");
console.log("  Check the treasury address twice before that command. It is the one");
console.log("  thing here that cannot be corrected afterwards.");
console.log("");
