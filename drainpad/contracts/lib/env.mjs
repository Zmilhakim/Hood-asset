// Shared entry checks for the scripts that spend gas. Deploying the launchpad and
// launching a token both do something that cannot be taken back, so everything
// they can verify before broadcasting is verified here first.
import { setDefaultResultOrder } from "node:dns";
import { setDefaultAutoSelectFamily } from "node:net";

import { createPublicClient, defineChain, http, isAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";

import { extsloadAbi } from "./pool.mjs";

/**
 * Make Node connect over IPv4, and to one address at a time.
 *
 * The RPC sits behind Cloudflare, which answers DNS with two IPv4 addresses and
 * two IPv6 ones. Node races all four at once — "happy eyeballs" — on a ten
 * second connect budget that nothing in viem can raise, and on a link with no
 * working IPv6 route the two v6 attempts hang for the whole ten seconds and take
 * the other two down with them. curl reaches the same endpoint in under two.
 *
 * The symptom is a script reporting "cannot reach the RPC" about an endpoint
 * that is up, which sends the reader hunting for another one. So the race is
 * turned off and IPv4 put first, which is the difference between a connection
 * that fails and one that takes two seconds.
 */
setDefaultResultOrder("ipv4first");
setDefaultAutoSelectFamily(false);

export const DEFAULT_RPC_URL = "https://rpc.mainnet.chain.robinhood.com";
export const ROBINHOOD_CHAIN_ID = 4663;

/**
 * How long to wait on the RPC, and how many times to ask again.
 *
 * viem's default is ten seconds and no patience for a slow answer, which is
 * fine on a datacentre link and wrong on a phone: the public endpoint is up and
 * simply takes longer than that to reply over a mobile connection, and the
 * script was reporting "cannot reach the RPC" for what was actually a slow one.
 * Being slow and being down want different answers, so this waits.
 *
 * RPC_TIMEOUT_MS and RPC_RETRIES change both.
 */
export const RPC_TIMEOUT_MS = Number(process.env.RPC_TIMEOUT_MS ?? 60_000);
export const RPC_RETRIES = Number(process.env.RPC_RETRIES ?? 4);

/** The one place the transport is configured, so every client agrees. */
export const rpcTransport = (url) =>
  http(url, { timeout: RPC_TIMEOUT_MS, retryCount: RPC_RETRIES, retryDelay: 1_500 });

export function fail(...lines) {
  for (const line of lines) console.error(line);
  process.exit(1);
}

export function requireEnv(keys) {
  const missing = keys.filter((key) => !process.env[key]);
  if (missing.length > 0) fail(`missing: ${missing.join(", ")}`);
}

export function requireAddress(key) {
  const value = process.env[key];
  if (!isAddress(value)) fail(`${key} is not an address: ${value}`);
  return value;
}

/**
 * Validates the key's shape before handing it to the crypto library, which
 * otherwise fails with a stack trace that says nothing useful. Nothing here
 * ever prints the key itself — only its length and shape.
 */
export function requireDeployerKey() {
  const rawKey = (process.env.DEPLOYER_KEY ?? "").trim();

  if (rawKey === "") fail("DEPLOYER_KEY is not set.");

  if (rawKey.includes(" ")) {
    fail(
      "DEPLOYER_KEY contains spaces — that looks like a seed phrase, not a private key.",
      "",
      "A seed phrase is 12 or 24 words. A private key is a single 66-character",
      "string starting with 0x. In MetaMask they are different exports:",
      "  seed phrase -> Settings > Security & Privacy > Reveal Secret Recovery Phrase",
      "  private key -> the three dots next to the account > Account details > Show private key",
    );
  }

  if (rawKey === "0x…" || rawKey === "0x...") {
    fail("DEPLOYER_KEY is still the placeholder from the instructions.", "Replace it with the actual key.");
  }

  if (!rawKey.startsWith("0x")) {
    fail(
      `DEPLOYER_KEY is missing its 0x prefix (it is ${rawKey.length} characters).`,
      "Export it as 0x followed by the 64 hex characters.",
    );
  }

  if (!/^0x[0-9a-fA-F]{64}$/.test(rawKey)) {
    fail(
      `DEPLOYER_KEY is ${rawKey.length} characters; a private key is exactly 66 (0x + 64 hex).`,
      rawKey.length !== 66
        ? "A truncated paste is the usual cause — check nothing was cut off at either end."
        : "It is the right length but contains a character that is not 0-9 or a-f.",
    );
  }

  return privateKeyToAccount(rawKey);
}

export function robinhoodChain(rpcUrl) {
  return defineChain({
    id: ROBINHOOD_CHAIN_ID,
    name: "Robinhood Chain",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: [rpcUrl] } },
  });
}

/** Connects, and refuses to go on if the endpoint is not the chain we meant. */
export async function connect() {
  const rpcUrl = process.env.RPC_URL || DEFAULT_RPC_URL;
  const chain = robinhoodChain(rpcUrl);
  const publicClient = createPublicClient({ chain, transport: rpcTransport(rpcUrl) });

  let liveChainId;
  try {
    liveChainId = await publicClient.getChainId();
  } catch (error) {
    fail(
      `cannot reach the RPC at ${rpcUrl}`,
      `  ${error.shortMessage ?? error.message?.split("\n")[0] ?? error}`,
      "",
      `It was given ${RPC_TIMEOUT_MS / 1000}s and ${RPC_RETRIES} retries, so this is the endpoint`,
      "being unreachable rather than merely slow. On a phone or a bad line, more",
      "patience sometimes is the fix:",
      "",
      "    export RPC_TIMEOUT_MS=180000",
      "",
      "Public endpoints also go down, rate-limit and get replaced. Point this at",
      "another one and re-run:",
      "",
      "    export RPC_URL=https://…",
    );
  }

  if (liveChainId !== chain.id) {
    fail(
      `${rpcUrl} is chain ${liveChainId}, not Robinhood Chain (${chain.id})`,
      "Deploying against the wrong chain would put the launchpad somewhere nobody is looking.",
    );
  }

  console.log(`rpc        ${rpcUrl} (chain ${liveChainId})`);
  return { chain, publicClient, rpcUrl };
}

const ownerAbi = [{ type: "function", name: "owner", inputs: [], outputs: [{ type: "address" }], stateMutability: "view" }];

/**
 * Checks the venue is what it claims to be before anything is spent on it.
 *
 * There is no pool factory to cross-examine in v4 — one manager holds every pool
 * — so what can be checked is that the address answers the two surfaces this
 * launchpad depends on: `extsload`, which is how the pool's price is read, and `owner`,
 * which every deployed PoolManager has. An address that answers both is a
 * PoolManager; an address that answers neither is a typo.
 */
export async function checkPoolManager(publicClient, poolManager) {
  const code = await publicClient.getCode({ address: poolManager });
  if (!code || code === "0x") fail(`POOL_MANAGER (${poolManager}) has no code on this chain — check the address`);

  let owner;
  try {
    [, owner] = await Promise.all([
      publicClient.readContract({
        address: poolManager,
        abi: extsloadAbi,
        functionName: "extsload",
        args: ["0x0000000000000000000000000000000000000000000000000000000000000000"],
      }),
      publicClient.readContract({ address: poolManager, abi: ownerAbi, functionName: "owner" }),
    ]);
  } catch {
    fail(`POOL_MANAGER (${poolManager}) does not answer extsload()/owner() — it is not a Uniswap v4 pool manager`);
  }

  console.log(`venue      pool manager ${poolManager}, owner ${owner}`);
  return { owner };
}
