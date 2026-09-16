// Shared entry checks for the two scripts that spend gas. Both of them do
// something that cannot be taken back, so everything they can verify before
// broadcasting is verified here first.
import { createPublicClient, defineChain, http, isAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";

export const DEFAULT_RPC_URL = "https://rpc.mainnet.chain.robinhood.com";
export const ROBINHOOD_CHAIN_ID = 4663;

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
  const publicClient = createPublicClient({ chain, transport: http() });

  let liveChainId;
  try {
    liveChainId = await publicClient.getChainId();
  } catch (error) {
    fail(
      `cannot reach the RPC at ${rpcUrl}`,
      `  ${error.shortMessage ?? error.message?.split("\n")[0] ?? error}`,
      "",
      "Public endpoints go down, rate-limit and get replaced. Point this at",
      "another one and re-run:",
      "",
      "    export RPC_URL=https://…",
    );
  }

  if (liveChainId !== chain.id) {
    fail(
      `${rpcUrl} is chain ${liveChainId}, not Robinhood Chain (${chain.id})`,
      "Packing against the wrong chain would put the crate somewhere nobody is looking.",
    );
  }

  console.log(`rpc        ${rpcUrl} (chain ${liveChainId})`);
  return { chain, publicClient, rpcUrl };
}

const positionManagerAbi = [
  { type: "function", name: "factory", inputs: [], outputs: [{ type: "address" }], stateMutability: "view" },
  { type: "function", name: "WETH9", inputs: [], outputs: [{ type: "address" }], stateMutability: "view" },
];

const dexFactoryAbi = [
  {
    type: "function",
    name: "feeAmountTickSpacing",
    inputs: [{ type: "uint24" }],
    outputs: [{ type: "int24" }],
    stateMutability: "view",
  },
];

/**
 * Checks the venue against itself rather than against a documentation page: the
 * position manager knows which factory and which WETH it was deployed against,
 * so reading them back is the difference between "a doc said so" and "the chain
 * says so". Returns the WETH the venue actually uses, and the tier's spacing.
 */
export async function checkVenue(publicClient, { dexFactory, positionManager, fee }) {
  for (const [label, address] of [
    ["DEX_FACTORY", dexFactory],
    ["POSITION_MANAGER", positionManager],
  ]) {
    const code = await publicClient.getCode({ address });
    if (!code || code === "0x") fail(`${label} (${address}) has no code on this chain — check the address`);
  }

  let declaredFactory;
  let declaredWeth;
  try {
    [declaredFactory, declaredWeth] = await Promise.all([
      publicClient.readContract({ address: positionManager, abi: positionManagerAbi, functionName: "factory" }),
      publicClient.readContract({ address: positionManager, abi: positionManagerAbi, functionName: "WETH9" }),
    ]);
  } catch {
    fail(
      `POSITION_MANAGER (${positionManager}) does not answer factory()/WETH9() — it is not a Uniswap v3 position manager`,
    );
  }

  if (declaredFactory.toLowerCase() !== dexFactory.toLowerCase()) {
    fail(
      `the position manager belongs to factory ${declaredFactory}, not ${dexFactory}`,
      "these two must be from the same deployment or packing will revert",
    );
  }

  if (process.env.WETH && process.env.WETH.toLowerCase() !== declaredWeth.toLowerCase()) {
    fail(`WETH ${process.env.WETH} is not the WETH this position manager uses (${declaredWeth})`);
  }

  const spacing = await publicClient.readContract({
    address: dexFactory,
    abi: dexFactoryAbi,
    functionName: "feeAmountTickSpacing",
    args: [fee],
  });
  if (spacing === 0) fail(`the venue does not run a ${fee / 10_000}% fee tier — pick one it does`);

  console.log(`venue      factory and position manager agree, WETH ${declaredWeth}, tier ${fee} spacing ${spacing}`);
  return { weth: declaredWeth, spacing };
}
