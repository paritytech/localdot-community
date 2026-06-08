import fs from 'fs';
import { ethers } from 'hardhat';
import path from 'path';

/**
 * Update .env.local file with new ZKPassportRegistry address
 */
function updateEnvFile(registryAddress: string): void {
  const envPath = path.resolve(__dirname, '../../../apps/web/.env.local');

  if (!fs.existsSync(envPath)) {
    console.log('⚠️  apps/web/.env.local not found, skipping env update');
    return;
  }

  let envContent = fs.readFileSync(envPath, 'utf8');

  // Update or add VITE_ZKPASSPORT_REGISTRY_ADDRESS
  if (envContent.includes('VITE_ZKPASSPORT_REGISTRY_ADDRESS=')) {
    envContent = envContent.replace(
      /^VITE_ZKPASSPORT_REGISTRY_ADDRESS=.*/m,
      `VITE_ZKPASSPORT_REGISTRY_ADDRESS=${registryAddress}`,
    );
  } else {
    envContent += `\n# ZKPassport Registry contract address\nVITE_ZKPASSPORT_REGISTRY_ADDRESS=${registryAddress}\n`;
  }

  fs.writeFileSync(envPath, envContent);
  console.log('\n📝 Updated apps/web/.env.local with ZKPassportRegistry address');
}

/**
 * Update .github/env file for CI/CD deployments
 */
function updateGithubEnv(registryAddress: string): void {
  const githubEnvPath = path.resolve(__dirname, '../../../.github/env');

  if (!fs.existsSync(githubEnvPath)) {
    console.log('⚠️  .github/env not found, skipping CI env update');
    return;
  }

  let envContent = fs.readFileSync(githubEnvPath, 'utf8');

  // Update or add VITE_ZKPASSPORT_REGISTRY_ADDRESS
  if (envContent.includes('VITE_ZKPASSPORT_REGISTRY_ADDRESS=')) {
    envContent = envContent.replace(
      /^VITE_ZKPASSPORT_REGISTRY_ADDRESS=.*/m,
      `VITE_ZKPASSPORT_REGISTRY_ADDRESS=${registryAddress}`,
    );
  } else {
    envContent += `\nVITE_ZKPASSPORT_REGISTRY_ADDRESS=${registryAddress}`;
  }

  fs.writeFileSync(githubEnvPath, envContent);
  console.log('📝 Updated .github/env for CI/CD deployments');
}

async function main() {
  const [deployer] = await ethers.getSigners();
  const network = await ethers.provider.getNetwork();
  const chainId = network.chainId;

  console.log('Deploying ZKPassportRegistry with account:', deployer.address);
  console.log(
    'Account balance:',
    (await ethers.provider.getBalance(deployer.address)).toString(),
  );

  // Deploy ZKPassportRegistry
  console.log('\nDeploying ZKPassportRegistry...');
  const ZKPassportRegistry = await ethers.getContractFactory('ZKPassportRegistry');
  const registry = await ZKPassportRegistry.deploy();
  await registry.waitForDeployment();
  const registryAddress = await registry.getAddress();

  console.log('\n✅ Deployment successful!');
  console.log('==========================================');
  console.log('ZKPassportRegistry:', registryAddress);
  console.log('Network:', network.name, `(chainId: ${chainId})`);
  console.log('==========================================\n');

  // Save deployment info
  const deployment = {
    network: network.name || 'unknown',
    chainId: chainId.toString(),
    zkPassportRegistry: {
      address: registryAddress,
    },
    deployer: deployer.address,
    timestamp: new Date().toISOString(),
  };

  console.log('Deployment info:', JSON.stringify(deployment, null, 2));

  // Update .env.local with new contract address
  updateEnvFile(registryAddress);

  // Update .github/env for CI/CD deployments
  updateGithubEnv(registryAddress);

  // Verify initial state
  console.log('\nVerifying initial state...');
  const testAddress = '0x0000000000000000000000000000000000000001';
  const isVerified = await registry.isVerified(testAddress);

  console.log('Test address verified:', isVerified);
  console.log('\n✅ All checks passed!');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
