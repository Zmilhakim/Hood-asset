// Compiles the crate contracts with solc-js, along with the Uniswap v4 pool
// manager itself: the tests run against the real thing rather than a stand-in,
// so it has to come out of the same compile.
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const solc = require("solc");

const here = dirname(fileURLToPath(import.meta.url));
const srcDir = join(here, "src");
const mockDir = join(here, "test", "mocks");
const outDir = join(here, "out");

function collectSources(dir, prefix = "") {
  const sources = {};
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) Object.assign(sources, collectSources(join(dir, entry.name), rel));
    else if (entry.name.endsWith(".sol")) sources[rel] = { content: readFileSync(join(dir, entry.name), "utf8") };
  }
  return sources;
}

// v4-core and v4-periphery are Foundry projects, and their sources import their
// own dependencies through remappings that npm knows nothing about.
const REMAPPINGS = [
  ["solmate/", "@uniswap/v4-core/lib/solmate/"],
  ["permit2/", "@uniswap/v4-periphery/lib/permit2/"],
  ["openzeppelin-contracts/", "@uniswap/v4-core/lib/openzeppelin-contracts/"],
];

function findImports(path) {
  try {
    for (const [from, to] of REMAPPINGS) {
      if (path.startsWith(from)) path = to + path.slice(from.length);
    }
    if (path.startsWith("@")) return { contents: readFileSync(require.resolve(path, { paths: [here] }), "utf8") };
    return { contents: readFileSync(join(srcDir, path), "utf8") };
  } catch (error) {
    return { error: `not found: ${path} (${error.message})` };
  }
}

const sources = collectSources(srcDir);
// Keyed under mocks/ so their `../interfaces/…` imports resolve to the very
// same source entries the contracts use.
if (existsSync(mockDir)) Object.assign(sources, collectSources(mockDir, "mocks"));

const input = {
  language: "Solidity",
  sources,
  settings: {
    optimizer: { enabled: true, runs: 200 },
    evmVersion: "cancun",
    outputSelection: { "*": { "*": ["abi", "evm.bytecode.object", "evm.deployedBytecode.object"] } },
  },
};

const output = JSON.parse(solc.compile(JSON.stringify(input), { import: findImports }));

const diagnostics = output.errors ?? [];
for (const d of diagnostics) console.error(d.formattedMessage.trimEnd());
if (diagnostics.some((d) => d.severity === "error")) {
  console.error("\ncompile failed");
  process.exit(1);
}

mkdirSync(outDir, { recursive: true });

const DEPLOYED = {
  "CratePacker.sol": "CratePacker",
  "CrateRouter.sol": "CrateRouter",
  "CrateSeal.sol": "CrateSeal",
  "CrateToken.sol": "CrateToken",
};

const TEST_ONLY = {
  "mocks/TestVenue.sol": ["TestPoolManager", "TestSwapRouter"],
};

const limit = 24576; // EIP-170 deployed-bytecode ceiling

for (const [file, name] of Object.entries(DEPLOYED)) {
  const artifact = output.contracts[file][name];
  writeFileSync(join(outDir, `${name}.json`), JSON.stringify(artifact, null, 2));

  const size = artifact.evm.deployedBytecode.object.length / 2;
  const status = size > limit ? "OVER EIP-170 LIMIT" : "ok";
  console.log(`${name.padEnd(20)} ${String(size).padStart(6)} bytes deployed  ${status}`);
  if (size > limit) process.exitCode = 1;
}

for (const [file, names] of Object.entries(TEST_ONLY)) {
  for (const name of names) {
    writeFileSync(join(outDir, `${name}.json`), JSON.stringify(output.contracts[file][name], null, 2));
  }
}

console.log(`\nartifacts written to ${outDir}`);
