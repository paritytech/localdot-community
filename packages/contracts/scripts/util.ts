import { ethers } from 'hardhat';

/**
 * Get chain-specific token info based on chain ID.
 *
 * evmDecimals: decimals used in EVM context (msg.value, contract storage).
 *   Revive maps native planck → 18-decimal wei via NativeToEthRatio.
 *   Hardhat/ethers scripts go through the EVM RPC, so all values
 *   (both msg.value and ABI params) must use evmDecimals.
 *
 * nativeDecimals: native chain decimals (10 for PAS, 18 for ETH).
 *   Only relevant for Substrate-side interactions (Revive.call value param).
 */
export async function getChainTokenInfo(): Promise<{
  decimals: number;
  nativeDecimals: number;
  tokenName: string;
}> {
  const network = await ethers.provider.getNetwork();
  const chainId = Number(network.chainId);

  if (chainId === 420420417) {
    return { decimals: 18, nativeDecimals: 10, tokenName: 'PAS' };
  } else if (chainId === 31337) {
    // Hardhat test network — only used by `hardhat test`
    return { decimals: 18, nativeDecimals: 18, tokenName: 'ETH' };
  } else {
    throw new Error(`Unsupported chain ID ${chainId}. Supported: 420420417 (Paseo)`);
  }
}

export interface DeploymentInfo {
  network: string;
  chainId: string;
  market: {
    address: string;
  };
  deployer?: string;
  timestamp?: string;
}

/**
 * Load deployment info from .env.local (VITE_P2PMARKET_ADDRESS)
 * Expects dotenv to have loaded apps/web/.env.local before calling
 */
export function loadDeploymentFromEnv(): DeploymentInfo | null {
  const marketAddress = process.env.VITE_P2PMARKET_ADDRESS;
  const chainId = process.env.VITE_CHAIN_ID;
  if (!marketAddress?.trim()) return null;
  const chainIdStr = chainId ?? '420420417';
  return {
    network: chainIdStr === '420420417' ? 'Paseo Asset Hub' : 'unknown',
    chainId: chainIdStr,
    market: { address: marketAddress },
  };
}
