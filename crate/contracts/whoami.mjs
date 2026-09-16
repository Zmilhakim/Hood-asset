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
const view = (name, type) => [
  { type: "function", name, inputs: [], outputs: [{ type }], stateMutability: "view" },
];

let owner;
let packed;
let seal;
try {
  [owner, packed, seal] = await Promise.all([
    publicClient.readContract({ address: process.env.PACKER, abi: view("packer", "address"), functionName: "packer" }),
    publicClient.readContract({ address: process.env.PACKER, abi: view("packed", "bool"), functionName: "packed" }),
    publicClient.readContract({ address: process.env.PACKER, abi: view("seal", "address"), functionName: "seal" }),
  ]);
} catch {
  fail(`PACKER (${process.env.PACKER}) does not answer like a CratePacker — check the address`);
}

// The address the fees are already committed to. Worth reading back even when
// nothing is wrong, because after `pack` it is far too late to look.
const treasury = await publicClient.readContract({
  address: seal,
  abi: view("feeBeneficiary", "address"),
  functionName: "feeBeneficiary",
});

const mine = owner.toLowerCase() === account.address.toLowerCase();
console.log(`packer     ${process.env.PACKER} answers to ${owner}`);
console.log(`match      ${mine ? "yes — this key can pack the crate" : "NO — this key cannot pack that crate"}`);
console.log(`state      ${packed ? "already packed" : "not packed yet"}`);
console.log(`treasury   ${treasury} — fees go here, and this cannot be changed`);

if (!mine) process.exit(1);
