// Turns a private key out of the environment into an account, or explains
// exactly what is wrong with it and stops.
//
// Nothing here ever prints the key. The messages describe its shape — length,
// prefix, whether it contains spaces — because that is enough to diagnose
// every paste mistake without putting the key on a screen, in a scrollback
// buffer, or in front of whoever is helping.
import { privateKeyToAccount } from "viem/accounts";

export function accountFromEnv(name = "DEPLOYER_KEY") {
  const raw = process.env[name];

  if (raw === undefined) {
    console.error(`missing: ${name}`);
    process.exit(1);
  }

  const key = raw.trim();

  if (key.includes(" ")) {
    console.error(`${name} contains spaces — that looks like a seed phrase, not a private key.`);
    console.error("");
    console.error("A seed phrase is 12 or 24 words. A private key is a single 66-character");
    console.error("string starting with 0x. In MetaMask they are different exports:");
    console.error("  seed phrase -> Settings > Security & Privacy > Reveal Secret Recovery Phrase");
    console.error("  private key -> the three dots next to the account > Account details > Show private key");
    process.exit(1);
  }

  if (key === "0x…" || key === "0x..." || key === "") {
    console.error(`${name} is still the placeholder from the instructions.`);
    console.error("Replace 0x… with the actual key before exporting it.");
    process.exit(1);
  }

  if (!key.startsWith("0x")) {
    console.error(`${name} is missing its 0x prefix (it is ${key.length} characters).`);
    console.error("Export it as 0x followed by the 64 hex characters.");
    process.exit(1);
  }

  if (!/^0x[0-9a-fA-F]{64}$/.test(key)) {
    console.error(`${name} is ${key.length} characters; a private key is exactly 66 (0x + 64 hex).`);
    if (key.length !== 66) {
      console.error("A truncated paste is the usual cause — check nothing was cut off at either end.");
    } else {
      console.error("It is the right length but contains a character that is not 0-9 or a-f.");
    }
    process.exit(1);
  }

  return privateKeyToAccount(key);
}
