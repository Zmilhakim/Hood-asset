import { defineChain } from "viem";

export const ROBINHOOD_CHAIN_ID = 4663;

/**
 * Robinhood Chain — an Arbitrum Orbit L2 settling to Ethereum. Gas is paid in ETH.
 *
 * The defaults below come from public RPC/explorer listings. Verify them against
 * docs.robinhood.com/chain/connecting before pointing a production deploy at them,
 * and override with NEXT_PUBLIC_RPC_URL / NEXT_PUBLIC_EXPLORER_URL when you run
 * your own node.
 */
export const DEFAULT_RPC_URL = "https://rpc.nodeflare.app/robinhood/public";
export const DEFAULT_EXPLORER_URL = "https://robinhoodchain.blockscout.com";

const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL || DEFAULT_RPC_URL;
const explorerUrl = process.env.NEXT_PUBLIC_EXPLORER_URL || DEFAULT_EXPLORER_URL;

export const robinhoodChain = defineChain({
  id: ROBINHOOD_CHAIN_ID,
  name: "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [rpcUrl] } },
  blockExplorers: { default: { name: "Blockscout", url: explorerUrl } },
});

export function explorerAddress(address: string) {
  return `${explorerUrl}/address/${address}`;
}

export function explorerTx(hash: string) {
  return `${explorerUrl}/tx/${hash}`;
}
