// Generates a fresh deployer key — on YOUR machine, never on a server.
//
//   cd contracts && npm install && node new-wallet.mjs
//
// The key is printed once and written nowhere. Nothing here phones home,
// and nothing here saves state; re-running gives a completely new key.
//
// Why this is a script you run rather than a key someone hands you: a private
// key is only secret while it has existed in exactly one place. A key pasted
// into a chat, an issue, a DM or a CI log is not a secret any more, no matter
// who sent it or how quickly it was deleted.
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

const piped = !process.stdout.isTTY;

if (piped) {
  console.error("refusing to run: stdout is not a terminal.");
  console.error("");
  console.error("Piping or redirecting this means the key lands in a file, a log or");
  console.error("another program. Run it directly in your own terminal instead:");
  console.error("");
  console.error("    node new-wallet.mjs");
  process.exit(1);
}

const privateKey = generatePrivateKey();
const account = privateKeyToAccount(privateKey);

console.log("");
console.log("  address      " + account.address);
console.log("  private key  " + privateKey);
console.log("");
console.log("  ── this is shown once. It is not saved anywhere. ──");
console.log("");
console.log("  Next:");
console.log("    1. Store the private key in a password manager. Not a note, not a chat.");
console.log("    2. Send it to nobody. Not to support, not to a teammate, not to an AI.");
console.log("    3. Fund the address with ETH on Robinhood Chain for gas.");
console.log("    4. Deploy with it in your own shell:");
console.log("");
console.log("         export DEPLOYER_KEY=" + privateKey.slice(0, 6) + "…   # the full key");
console.log("         npm run deploy");
console.log("");
console.log("  This account holds no power over Hoodpad after the deploy — the factory");
console.log("  has no owner. Treat it as a one-job key and use a different address for");
console.log("  TREASURY, ideally a hardware wallet, since that one keeps receiving fees.");
console.log("");
