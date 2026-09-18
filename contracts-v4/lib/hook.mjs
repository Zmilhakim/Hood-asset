// Finding the address a v4 hook is allowed to live at.
//
// Uniswap v4 does not ask a hook which callbacks it wants; it reads them out of
// the hook's own address. The low 14 bits are the permission set, so a hook that
// takes a fee in `afterSwap` has to *be* at an address ending in those bits, and
// the only way to get one is to keep trying CREATE2 salts until one lands.
//
// `HoodFeeHook` needs two of them:
//
//   AFTER_SWAP_FLAG               1 << 6   the callback runs at all
//   AFTER_SWAP_RETURNS_DELTA_FLAG 1 << 2   and may claim part of the swap
//
// which is 0x44. Every other bit must be clear, or the pool manager would call
// into callbacks the hook does not implement and every swap would revert.

import { encodeAbiParameters, getContractAddress, keccak256 } from "viem";

export const AFTER_SWAP_FLAG = 1n << 6n;
export const AFTER_SWAP_RETURNS_DELTA_FLAG = 1n << 2n;
export const ALL_HOOK_MASK = (1n << 14n) - 1n;

/** The exact low-14-bit pattern `HoodFeeHook`'s address has to carry. */
export const REQUIRED_FLAGS = AFTER_SWAP_FLAG | AFTER_SWAP_RETURNS_DELTA_FLAG;

export const hasRequiredFlags = (address) => (BigInt(address) & ALL_HOOK_MASK) === REQUIRED_FLAGS;

/** The hook's creation code with its one constructor argument appended. */
export function hookInitCode({ bytecode, poolManager }) {
  const creation = bytecode.startsWith("0x") ? bytecode : `0x${bytecode}`;
  const args = encodeAbiParameters([{ type: "address" }], [poolManager]);
  return `${creation}${args.slice(2)}`;
}

/**
 * The address a factory at `deployer` would land the factory contract on.
 *
 * The hook is deployed by the factory, not by the account running the deploy —
 * so the salt has to be mined against an address that does not exist yet. A
 * plain CREATE address is just the sender and its nonce, which makes this exact
 * rather than a guess.
 */
export const predictFactoryAddress = ({ deployer, nonce }) => getContractAddress({ from: deployer, nonce: BigInt(nonce) });

/**
 * Search for a salt that puts the hook on a valid address.
 *
 * @param factory the address that will run the CREATE2 — the factory contract.
 * @param initCode the hook's creation code plus constructor arguments.
 * @param limit how many salts to try before giving up.
 * @returns {{ salt: `0x${string}`, address: `0x${string}`, tries: number }}
 */
export function mineHookSalt({ factory, initCode, limit = 2_000_000 }) {
  const bytecodeHash = keccak256(initCode);

  for (let i = 0; i < limit; i++) {
    const salt = `0x${i.toString(16).padStart(64, "0")}`;
    const address = getContractAddress({ opcode: "CREATE2", from: factory, salt, bytecodeHash });
    if (hasRequiredFlags(address)) return { salt, address, tries: i + 1 };
  }

  throw new Error(`no salt found in ${limit} tries — raise the limit`);
}
