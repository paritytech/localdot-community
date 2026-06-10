/**
 * Top up the four seed accounts (AGENT1/2, PROVIDER1/2) from the deployer.
 *
 * Required when the seed signers run out of PAS to pay gas (e.g. fresh wallets
 * or after a redeploy moved them onto a new chain).
 *
 * Usage: `pnpm --filter @localdot/contracts run fund-seed`
 */
import { ethers } from 'hardhat';

interface FundingTarget {
  label: string;
  address: string;
  amount: string; // human-readable PAS
}

async function main() {
  const [deployer] = await ethers.getSigners();
  const network = await ethers.provider.getNetwork();

  const agent1Key = process.env.AGENT1_KEY;
  const agent2Key = process.env.AGENT2_KEY;
  const provider1Key = process.env.PROVIDER1_KEY;
  const provider2Key = process.env.PROVIDER2_KEY;

  if (!agent1Key || !agent2Key || !provider1Key || !provider2Key) {
    throw new Error('Missing AGENT1_KEY / AGENT2_KEY / PROVIDER1_KEY / PROVIDER2_KEY in packages/contracts/.env');
  }

  const provider = ethers.provider;
  const agent1 = new ethers.Wallet(agent1Key, provider);
  const agent2 = new ethers.Wallet(agent2Key, provider);
  const prov1 = new ethers.Wallet(provider1Key, provider);
  const prov2 = new ethers.Wallet(provider2Key, provider);

  // Agents need stake + gas (seed stakes 800/700 PAS).
  // Providers only sign txs (no value), so a small gas float is enough.
  const targets: FundingTarget[] = [
    { label: 'Agent 1', address: agent1.address, amount: '810' },
    { label: 'Agent 2', address: agent2.address, amount: '710' },
    { label: 'Provider 1', address: prov1.address, amount: '15' },
    { label: 'Provider 2', address: prov2.address, amount: '15' },
  ];

  console.log(`Network: ${network.name} (chainId: ${network.chainId})`);
  console.log(`Deployer: ${deployer.address}`);
  const deployerBalance = await provider.getBalance(deployer.address);
  console.log(`Deployer balance: ${ethers.formatEther(deployerBalance)} PAS\n`);

  for (const target of targets) {
    const before = await provider.getBalance(target.address);
    const required = ethers.parseEther(target.amount);

    if (before >= required) {
      console.log(
        `✓ ${target.label} (${target.address}) already has ${ethers.formatEther(before)} PAS — skipping`,
      );
      continue;
    }

    const topUp = required - before;
    console.log(
      `→ Funding ${target.label} (${target.address}) with ${ethers.formatEther(topUp)} PAS …`,
    );
    const tx = await deployer.sendTransaction({
      to: target.address,
      value: topUp,
    });
    await tx.wait();
    const after = await provider.getBalance(target.address);
    console.log(`  ✅ tx ${tx.hash} — new balance ${ethers.formatEther(after)} PAS`);
  }

  console.log('\nAll seed accounts funded.');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
