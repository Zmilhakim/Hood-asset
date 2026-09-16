// Which address does the key I stored actually control?
//
//   DEPLOYER_KEY=0x… npm run whoami
//
// Worth running after a key goes into a password manager and again before it
// signs anything: a truncated paste is silent until it is not. This prints the
// address and never the key, so it is safe to run where someone can see.
import { fail, requireDeployerKey } from "./lib/env.mjs";

const account = requireDeployerKey();

console.log(`address    ${account.address}`);

if (!process.env.PACKER) process.exit(0);

// If a packer is named, answer the question that actually matters: is this the
// key it will take orders from?
const { connect } = await import("./lib/env.mjs");
const { isAddress } = await import("viem");

if (!isAddress(process.env.PACKER)) fail(`PACKER is not an address: ${process.env.PACKER}`);

const { publicClient } = await connect();
const abi = [
  { type: "function", name: "packer", inputs: [], outputs: [{ type: "address" }], stateMutability: "view" },
  { type: "function", name: "packed", inputs: [], outputs: [{ type: "bool" }], stateMutability: "view" },
];

let owner;
let packed;
try {
  [owner, packed] = await Promise.all([
    publicClient.readContract({ address: process.env.PACKER, abi, functionName: "packer" }),
    publicClient.readContract({ address: process.env.PACKER, abi, functionName: "packed" }),
  ]);
} catch {
  fail(`PACKER (${process.env.PACKER}) does not answer like a CratePacker — check the address`);
}

const mine = owner.toLowerCase() === account.address.toLowerCase();
console.log(`packer     ${process.env.PACKER} answers to ${owner}`);
console.log(`match      ${mine ? "yes — this key can pack the crate" : "NO — this key cannot pack that crate"}`);
console.log(`state      ${packed ? "already packed" : "not packed yet"}`);

if (!mine) process.exit(1);
