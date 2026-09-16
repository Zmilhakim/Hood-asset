// A throwaway JSON-RPC node serving the test venue, so launch.mjs can be run
// against something that answers like a chain instead of only being read.
//
// It is not a chain: one transaction per block, no mempool, no reorgs, no other
// traders. It exists so the launch script's own plumbing — the simulation, the
// gas estimate, signing, the receipt, reading the notice back — is exercised by
// running it, rather than assumed to work.
//
//   node tools/local-node.mjs [port]
import { createServer } from "node:http";

import { createVM, runTx } from "@ethereumjs/vm";
import { createCustomCommon, Hardfork, Mainnet } from "@ethereumjs/common";
import { Account, Address, bytesToHex, hexToBytes } from "@ethereumjs/util";
import { createTxFromRLP } from "@ethereumjs/tx";
import { createBlock } from "@ethereumjs/block";
import { keccak256 } from "viem";

import { bootVenue, POSTER } from "../test/venue.mjs";

const port = Number(process.argv[2] ?? 8545);
const CHAIN_ID = 4663;
const GAS_PRICE = 100_000_000n; // 0.1 gwei, in the range an Orbit chain charges

// The chain id has to be the real one: a transaction signed for 4663 is
// rejected outright by a VM that thinks it is on mainnet, and that rejection
// would look like a bug in the launch script rather than in this file.
const common = createCustomCommon({ chainId: CHAIN_ID }, Mainnet, { hardfork: Hardfork.Prague });

const vm = await createVM({ common });
const venue = await bootVenue({ evm: vm.evm });

const receipts = new Map();
let blockNumber = 1n;

const quantity = (value) => `0x${BigInt(value).toString(16)}`;

// Whoever runs the script needs an account with something in it. Any address
// the caller asks about that has never been seen gets funded on the spot —
// this is a sandbox, not an accounting system.
async function ensureFunded(address) {
  const account = new Address(hexToBytes(address));
  const existing = await vm.stateManager.getAccount(account);
  if (!existing || existing.balance === 0n) {
    await vm.stateManager.putAccount(account, new Account(existing?.nonce ?? 0n, 10n ** 18n));
  }
}

// runCall writes straight through to the state manager, so a call that is only
// meant to be a question has to be wound back afterwards. Without this, viem's
// simulate would launch the token and the gas estimate right behind it would
// revert on a CREATE2 address that is suddenly taken.
async function simulate(tx) {
  await vm.stateManager.checkpoint();
  try {
    const result = await venue.run({
      to: tx.to,
      data: tx.data ?? "0x",
      caller: tx.from ? new Address(hexToBytes(tx.from)) : POSTER,
      value: tx.value ? BigInt(tx.value) : 0n,
    });

    // A revert has to come back as an error carrying the revert data, or viem
    // cannot decode the custom error and the script's failure path would never
    // be exercised.
    if (result.reverted) {
      const error = new Error("execution reverted");
      error.data = result.returnData;
      throw error;
    }

    return result;
  } finally {
    await vm.stateManager.revert();
  }
}

const handlers = {
  eth_chainId: () => quantity(CHAIN_ID),
  net_version: () => String(CHAIN_ID),
  eth_blockNumber: () => quantity(blockNumber),
  eth_gasPrice: () => quantity(GAS_PRICE),
  eth_maxPriorityFeePerGas: () => quantity(0n),

  eth_getBalance: async ([address]) => {
    await ensureFunded(address);
    const account = await vm.stateManager.getAccount(new Address(hexToBytes(address)));
    return quantity(account?.balance ?? 0n);
  },

  eth_getTransactionCount: async ([address]) => {
    await ensureFunded(address);
    const account = await vm.stateManager.getAccount(new Address(hexToBytes(address)));
    return quantity(account?.nonce ?? 0n);
  },

  eth_getCode: async ([address]) => bytesToHex(await vm.stateManager.getCode(new Address(hexToBytes(address)))),

  eth_call: async ([tx]) => (await simulate(tx)).returnData,

  eth_estimateGas: async ([tx]) =>
    // Intrinsic cost plus headroom; this node does not enforce a block limit.
    quantity(((await simulate(tx)).gasUsed * 3n) / 2n + 21_000n),

  eth_sendRawTransaction: async ([raw]) => {
    const tx = createTxFromRLP(hexToBytes(raw), { common: vm.common });
    await ensureFunded(tx.getSenderAddress().toString());

    // Without a block, block.timestamp is zero, and every notice this board
    // records comes back stamped "never" — which looks like a bug in whatever
    // is reading it rather than in here.
    const block = createBlock(
      {
        header: {
          number: blockNumber,
          timestamp: BigInt(Math.floor(Date.now() / 1000)),
          gasLimit: 1_000_000_000n,
          baseFeePerGas: GAS_PRICE,
        },
      },
      { common: vm.common, skipConsensusFormatValidation: true },
    );

    const result = await runTx(vm, { tx, block, skipBlockGasLimitValidation: true, skipBalance: false });
    const hash = keccak256(raw);

    receipts.set(hash.toLowerCase(), {
      transactionHash: hash,
      blockNumber: quantity(blockNumber),
      blockHash: keccak256(`0x${blockNumber.toString(16).padStart(64, "0")}`),
      transactionIndex: "0x0",
      from: tx.getSenderAddress().toString(),
      to: tx.to?.toString() ?? null,
      contractAddress: result.createdAddress?.toString() ?? null,
      cumulativeGasUsed: quantity(result.totalGasSpent),
      gasUsed: quantity(result.totalGasSpent),
      effectiveGasPrice: quantity(GAS_PRICE),
      status: result.execResult.exceptionError === undefined ? "0x1" : "0x0",
      type: "0x2",
      logsBloom: `0x${"0".repeat(512)}`,
      logs: (result.execResult.logs ?? []).map((log, index) => ({
        address: bytesToHex(log[0]),
        topics: log[1].map(bytesToHex),
        data: bytesToHex(log[2]),
        blockNumber: quantity(blockNumber),
        transactionHash: hash,
        transactionIndex: "0x0",
        logIndex: quantity(index),
        removed: false,
      })),
    });

    blockNumber += 1n;
    return hash;
  },

  eth_getTransactionReceipt: ([hash]) => receipts.get(hash.toLowerCase()) ?? null,

  eth_getBlockByNumber: () => ({
    number: quantity(blockNumber),
    hash: keccak256(`0x${blockNumber.toString(16).padStart(64, "0")}`),
    parentHash: `0x${"0".repeat(64)}`,
    timestamp: quantity(BigInt(Math.floor(Date.now() / 1000))),
    gasLimit: quantity(1_000_000_000n),
    gasUsed: "0x0",
    baseFeePerGas: quantity(GAS_PRICE),
    miner: `0x${"0".repeat(40)}`,
    transactions: [],
    difficulty: "0x0",
    totalDifficulty: "0x0",
    extraData: "0x",
    logsBloom: `0x${"0".repeat(512)}`,
    nonce: "0x0000000000000000",
    size: "0x0",
    stateRoot: `0x${"0".repeat(64)}`,
    receiptsRoot: `0x${"0".repeat(64)}`,
    transactionsRoot: `0x${"0".repeat(64)}`,
    sha3Uncles: `0x${"0".repeat(64)}`,
    uncles: [],
  }),
};

const server = createServer((req, res) => {
  let body = "";
  req.on("data", (chunk) => (body += chunk));
  req.on("end", async () => {
    const request = JSON.parse(body);
    const batch = Array.isArray(request) ? request : [request];

    const responses = await Promise.all(
      batch.map(async ({ id, method, params = [] }) => {
        const handler = handlers[method];
        if (!handler) {
          console.error(`  unhandled: ${method}`);
          return { jsonrpc: "2.0", id, error: { code: -32601, message: `unsupported: ${method}` } };
        }

        try {
          return { jsonrpc: "2.0", id, result: await handler(params) };
        } catch (error) {
          return {
            jsonrpc: "2.0",
            id,
            error: { code: 3, message: error.message, data: error.data ?? undefined },
          };
        }
      }),
    );

    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(Array.isArray(request) ? responses : responses[0]));
  });
});

server.listen(port, "127.0.0.1", () => {
  console.log(`local node on http://127.0.0.1:${port} (chain ${CHAIN_ID})`);
  console.log(`board    ${venue.hoodpad}`);
  console.log(`weth     ${venue.weth}`);
  console.log(`locker   ${venue.locker}`);
});
