import fs from 'fs';
import { ethers } from 'hardhat';
import path from 'path';

import { getChainTokenInfo } from './util';

/**
 * Update .env.local file with new contract address after deployment
 * Uses regex replacement to preserve existing variables
 */
function updateEnvFile(marketAddress: string, chainId: bigint): void {
  const envPath = path.resolve(__dirname, '../../../apps/web/.env.local');

  if (!fs.existsSync(envPath)) {
    console.log('⚠️  apps/web/.env.local not found, skipping env update');
    return;
  }

  let envContent = fs.readFileSync(envPath, 'utf8');

  // Update or add VITE_P2PMARKET_ADDRESS
  if (envContent.includes('VITE_P2PMARKET_ADDRESS=')) {
    envContent = envContent.replace(/^VITE_P2PMARKET_ADDRESS=.*/m, `VITE_P2PMARKET_ADDRESS=${marketAddress}`);
  } else {
    envContent += `\nVITE_P2PMARKET_ADDRESS=${marketAddress}`;
  }

  // Update or add VITE_CHAIN_ID
  if (envContent.includes('VITE_CHAIN_ID=')) {
    envContent = envContent.replace(/^VITE_CHAIN_ID=.*/m, `VITE_CHAIN_ID=${chainId}`);
  } else {
    envContent += `\nVITE_CHAIN_ID=${chainId}`;
  }

  // Update or add VITE_RPC_URL (eth-rpc proxy for the Paseo Next v2 AH)
  const rpcUrl = 'https://eth-rpc-paseo-next.polkadot.io';
  if (envContent.includes('VITE_RPC_URL=')) {
    envContent = envContent.replace(/^VITE_RPC_URL=.*/m, `VITE_RPC_URL=${rpcUrl}`);
  } else {
    envContent += `\nVITE_RPC_URL=${rpcUrl}`;
  }

  fs.writeFileSync(envPath, envContent);
  console.log('\n📝 Updated apps/web/.env.local with new contract address');
}

/**
 * Update .github/env file for CI/CD deployments
 */
function updateGithubEnv(marketAddress: string): void {
  const githubEnvPath = path.resolve(__dirname, '../../../.github/env');

  if (!fs.existsSync(githubEnvPath)) {
    console.log('⚠️  .github/env not found, skipping CI env update');
    return;
  }

  let envContent = fs.readFileSync(githubEnvPath, 'utf8');

  // Update VITE_P2PMARKET_ADDRESS
  if (envContent.includes('VITE_P2PMARKET_ADDRESS=')) {
    envContent = envContent.replace(/^VITE_P2PMARKET_ADDRESS=.*/m, `VITE_P2PMARKET_ADDRESS=${marketAddress}`);
  } else {
    envContent += `\nVITE_P2PMARKET_ADDRESS=${marketAddress}`;
  }

  fs.writeFileSync(githubEnvPath, envContent);
  console.log('📝 Updated .github/env for CI/CD deployments');
}

async function main() {
  const [deployer] = await ethers.getSigners();
  const network = await ethers.provider.getNetwork();
  const chainId = network.chainId;
  const { decimals, tokenName } = await getChainTokenInfo();

  console.log('Deploying contracts with account:', deployer.address);
  console.log('Account balance:', (await ethers.provider.getBalance(deployer.address)).toString());

  // Deploy P2PMarket
  console.log('\nDeploying P2PMarket...');
  const P2PMarket = await ethers.getContractFactory('P2PMarket');
  const market = await P2PMarket.deploy();
  await market.waitForDeployment();
  const marketAddress = await market.getAddress();

  console.log('\n✅ Deployment successful!');
  console.log('==========================================');
  console.log('P2PMarket:', marketAddress);
  console.log('Network:', network.name, `(chainId: ${chainId})`);
  console.log('Token:', tokenName, `(${decimals} decimals)`);
  console.log('==========================================\n');

  // Save deployment info
  const deployment = {
    network: network.name || 'unknown',
    chainId: chainId.toString(),
    market: {
      address: marketAddress,
    },
    deployer: deployer.address,
    timestamp: new Date().toISOString(),
  };

  console.log('Deployment info:', JSON.stringify(deployment, null, 2));

  // Update .env.local with new contract address
  updateEnvFile(marketAddress, chainId);

  // Update .github/env for CI/CD deployments
  updateGithubEnv(marketAddress);

  // Verify initial state
  console.log('\nVerifying initial state...');
  const version = await market.VERSION();
  const offerCount = await market.getOfferCount();

  console.log('Version:', version);
  console.log('Offer count:', offerCount.toString());
  console.log('\n✅ All checks passed!');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });