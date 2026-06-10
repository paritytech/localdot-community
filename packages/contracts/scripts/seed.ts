import { uploadToBulletin, calculateCID } from '@localdot/bulletin';
import { OfferMetadata } from '@localdot/types';
import { P2PMarket__factory } from '../typechain-types';
import dotenv from 'dotenv';
import { ethers } from 'hardhat';
import type { Wallet } from 'ethers';
import path from 'path';
import fs from 'fs';

import { loadDeploymentFromEnv, getChainTokenInfo } from './util';

async function cidExistsOnGateway(cid: string, ipfsGateway: string): Promise<boolean> {
  try {
    const url = `${ipfsGateway}${cid}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const response = await fetch(url, { method: 'HEAD', signal: controller.signal });
    clearTimeout(timeout);
    return response.ok;
  } catch {
    return false;
  }
}

async function uploadMetadataIfNeeded(
  metadata: unknown,
  uploadOptions: { accountSeed: string; bulletinEndpoint: string; ipfsGateway: string }
): Promise<{ cid: string; skipped: boolean }> {
  const metadataBytes = new TextEncoder().encode(JSON.stringify(metadata, null, 2));
  const cid = calculateCID(metadataBytes);
  const exists = await cidExistsOnGateway(cid, uploadOptions.ipfsGateway);
  if (exists) return { cid, skipped: true };
  const result = await uploadToBulletin(metadataBytes, uploadOptions);
  return { cid: result.cid, skipped: false };
}

/** Delay to avoid nonce/stale errors between transactions */
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Seed script for P2PMarket contract
 *
 * Creates 2 agents and 10 offers with realistic test data:
 * - 2 agents (different locations, hours, fees)
 * - 10 offers from 2 providers, various amounts/fees
 * - Some offers on both agents, some on one, some direct P2P
 * - Tests: same offer at different agents, availability overlaps, price variety
 */
async function main() {
  const startTime = Date.now();

  const network = await ethers.provider.getNetwork();
  const chainId = network.chainId;
  const { decimals, tokenName } = await getChainTokenInfo();

  console.log('🌱 Seeding P2PMarket...');
  console.log('Network:', network.name, `(chainId: ${chainId})`);
  console.log('Token:', tokenName, `(${decimals} decimals)`);

  // Load environment
  const envPath = path.resolve(__dirname, '../../../apps/web/.env.local');
  if (!fs.existsSync(envPath)) throw new Error('apps/web/.env.local not found');
  dotenv.config({ path: envPath });

  const bulletinEndpoint = process.env.VITE_BULLETIN_ENDPOINT;
  const ipfsGateway = process.env.VITE_IPFS_GATEWAY;
  if (!bulletinEndpoint || !ipfsGateway) throw new Error('Missing VITE_BULLETIN_ENDPOINT or VITE_IPFS_GATEWAY');

  const deployment = loadDeploymentFromEnv();
  if (!deployment?.market.address) throw new Error('No VITE_P2PMARKET_ADDRESS found');

  console.log('📜 Market:', deployment.market.address);

  // Load 4 signers from env
  const agent1Key = process.env.AGENT1_KEY;
  const agent2Key = process.env.AGENT2_KEY;
  const provider1Key = process.env.PROVIDER1_KEY;
  const provider2Key = process.env.PROVIDER2_KEY;

  if (!agent1Key || !agent2Key || !provider1Key || !provider2Key) {
    throw new Error(
      'Missing seed keys. Set AGENT1_KEY, AGENT2_KEY, PROVIDER1_KEY, PROVIDER2_KEY in packages/contracts/.env'
    );
  }

  const provider = ethers.provider;
  const agent1 = new ethers.Wallet(agent1Key, provider);
  const agent2 = new ethers.Wallet(agent2Key, provider);
  const prov1 = new ethers.Wallet(provider1Key, provider);
  const prov2 = new ethers.Wallet(provider2Key, provider);

  console.log('\n👤 Agent 1:', agent1.address);
  console.log('👤 Agent 2:', agent2.address);
  console.log('👤 Provider 1:', prov1.address);
  console.log('👤 Provider 2:', prov2.address);

  const market = P2PMarket__factory.connect(deployment.market.address, provider);
  const toTokens = (amount: string) => ethers.parseUnits(amount, decimals);

  const uploadOptions = {
    accountSeed: '//Alice',
    bulletinEndpoint,
    ipfsGateway,
  };

  // ═══════════════════════════════════════════
  // ═══ REGISTER AGENTS ═══
  // ═══════════════════════════════════════════

  console.log('\n🏪 Registering agents...\n');

  // Agent 1: Western Union — city center, long hours Mon-Sat
  const agent1Meta = {
    location: { lat: 45.2551, lng: 19.8451, city: 'Novi Sad', country: 'Serbia', address: 'Bulevar Oslobodjenja 15' },
    workingHours: {
      schedule: {
        Mon: { open: '08:00', close: '20:00' },
        Tue: { open: '08:00', close: '20:00' },
        Wed: { open: '08:00', close: '20:00' },
        Thu: { open: '08:00', close: '20:00' },
        Fri: { open: '08:00', close: '20:00' },
        Sat: { open: '09:00', close: '15:00' },
      },
      timezone: 'Europe/Belgrade',
    },
  };

  console.log('Registering Agent 1 (Western Union — city center)...');
  const a1Cid = await uploadMetadataIfNeeded(agent1Meta, uploadOptions);
  console.log(`  ✓ Metadata: ${a1Cid.cid}`);
  const agent1Stake = toTokens('800'); // 800 PAS insurance
  const a1Tx = await market
    .connect(agent1)
    .registerAgent('Western Union', a1Cid.cid, 5n, 24n, 1n, { value: agent1Stake });
  await a1Tx.wait();
  console.log(`  ✅ Agent 1 registered (staked 800 ${tokenName})`);

  await delay(6000);

  // Agent 2: MoneyGram — Petrovaradin, weekdays + weekends different hours, cheaper fee
  const agent2Meta = {
    location: { lat: 45.2517, lng: 19.8658, city: 'Novi Sad', country: 'Serbia', address: 'Beogradska 3, Petrovaradin' },
    workingHours: {
      schedule: {
        Mon: { open: '09:00', close: '17:00' },
        Tue: { open: '09:00', close: '17:00' },
        Wed: { open: '09:00', close: '17:00' },
        Thu: { open: '09:00', close: '17:00' },
        Fri: { open: '09:00', close: '17:00' },
        Sat: { open: '10:00', close: '14:00' },
        Sun: { open: '10:00', close: '14:00' },
      },
      timezone: 'Europe/Belgrade',
    },
  };

  console.log('Registering Agent 2 (MoneyGram — Petrovaradin)...');
  const a2Cid = await uploadMetadataIfNeeded(agent2Meta, uploadOptions);
  console.log(`  ✓ Metadata: ${a2Cid.cid}`);
  const agent2Stake = toTokens('700'); // 700 PAS insurance
  const a2Tx = await market
    .connect(agent2)
    .registerAgent('MoneyGram', a2Cid.cid, 3n, 24n, 1n, { value: agent2Stake });
  await a2Tx.wait();
  console.log(`  ✅ Agent 2 registered (staked 700 ${tokenName})`);

  await delay(6000);

  // ═══════════════════════════════════════════
  // ═══ CREATE OFFERS ═══
  // ═══════════════════════════════════════════

  console.log('\n📝 Creating offers...\n');

  // Helper to create an offer
  async function createOffer(
    signer: Wallet,
    label: string,
    offerType: number,
    amount: string,
    minAmount: string,
    flatFee: bigint,
    currency: string,
    metadata: OfferMetadata,
    agents: string[],
  ) {
    console.log(`Creating ${label}...`);
    const cid = await uploadMetadataIfNeeded(metadata, uploadOptions);
    console.log(`  ✓ Metadata: ${cid.cid}`);
    const tx = await market.connect(signer).createOffer(
      offerType, toTokens(amount), toTokens(minAmount), flatFee, currency, cid.cid, agents
    );
    await tx.wait();
    console.log(`  ✅ ${label} created`);
    await delay(6000);
  }

  // ── Offer 1: Provider1, SELL, 500, both agents ──
  // Tests: same offer visible at both agents with different total fees
  await createOffer(prov1, 'Offer 1 (P1 SELL 500 both agents)', 0, '500', '10', 12n, 'USD', {
    location: { lat: 45.2551, lng: 19.8451, radius: 2, city: 'Novi Sad', country: 'Serbia' },
    availability: {
      schedule: {
        Mon: { open: '10:00', close: '18:00' },
        Tue: { open: '10:00', close: '18:00' },
        Wed: { open: '10:00', close: '18:00' },
        Thu: { open: '10:00', close: '18:00' },
        Fri: { open: '10:00', close: '18:00' },
      },
      timezone: 'Europe/Belgrade',
    },
  }, [agent1.address, agent2.address]);

  // ── Offer 2: Provider1, SELL, 200, agent1 only ──
  // Tests: smaller amount, only one agent, cheap fee
  await createOffer(prov1, 'Offer 2 (P1 SELL 200 agent1)', 0, '200', '5', 5n, 'USD', {
    location: { lat: 45.2461, lng: 19.8347, radius: 1.5, city: 'Novi Sad', country: 'Serbia' },
    availability: {
      schedule: {
        Mon: { open: '09:00', close: '21:00' },
        Tue: { open: '09:00', close: '21:00' },
        Wed: { open: '09:00', close: '21:00' },
        Thu: { open: '09:00', close: '21:00' },
        Fri: { open: '09:00', close: '21:00' },
        Sat: { open: '10:00', close: '16:00' },
      },
      timezone: 'Europe/Belgrade',
    },
  }, [agent1.address]);

  // ── Offer 3: Provider2, SELL, 800, both agents ──
  // Tests: high amount, different provider, both agents
  await createOffer(prov2, 'Offer 3 (P2 SELL 800 both agents)', 0, '800', '20', 15n, 'USD', {
    location: { lat: 45.2406, lng: 19.8287, radius: 1.8, city: 'Novi Sad', country: 'Serbia' },
    availability: {
      schedule: {
        Mon: { open: '08:00', close: '16:00' },
        Tue: { open: '08:00', close: '16:00' },
        Wed: { open: '08:00', close: '16:00' },
        Thu: { open: '08:00', close: '16:00' },
        Fri: { open: '08:00', close: '16:00' },
      },
      timezone: 'Europe/Belgrade',
    },
  }, [agent1.address, agent2.address]);

  // ── Offer 4: Provider2, SELL, 300, agent2 only ──
  // Tests: only at cheaper agent, weekend availability
  await createOffer(prov2, 'Offer 4 (P2 SELL 300 agent2)', 0, '300', '10', 8n, 'USD', {
    location: { lat: 45.2517, lng: 19.8658, radius: 1.5, city: 'Novi Sad', country: 'Serbia' },
    availability: {
      schedule: {
        Fri: { open: '14:00', close: '20:00' },
        Sat: { open: '10:00', close: '18:00' },
        Sun: { open: '10:00', close: '18:00' },
      },
      timezone: 'Europe/Belgrade',
    },
  }, [agent2.address]);

  // ── Offer 5: Provider1, SELL, 100, agent2 only ──
  // Tests: small amount, cheapest total fee (3 + 3 = $6)
  await createOffer(prov1, 'Offer 5 (P1 SELL 100 agent2 cheap)', 0, '100', '5', 3n, 'USD', {
    location: { lat: 45.2396, lng: 19.8516, radius: 1, city: 'Novi Sad', country: 'Serbia' },
    availability: {
      schedule: {
        Mon: { open: '10:00', close: '17:00' },
        Wed: { open: '10:00', close: '17:00' },
        Fri: { open: '10:00', close: '17:00' },
      },
      timezone: 'Europe/Belgrade',
    },
  }, [agent2.address]);

  // ── Offer 6: Provider2, SELL, 1000, agent1 only ──
  // Tests: whale offer, expensive fee, only at premium agent
  await createOffer(prov2, 'Offer 6 (P2 SELL 1000 agent1 expensive)', 0, '1000', '50', 25n, 'USD', {
    location: { lat: 45.2531, lng: 19.8516, radius: 2, city: 'Novi Sad', country: 'Serbia' },
    availability: {
      schedule: {
        Mon: { open: '09:00', close: '15:00' },
        Tue: { open: '09:00', close: '15:00' },
        Wed: { open: '09:00', close: '15:00' },
        Thu: { open: '09:00', close: '15:00' },
        Fri: { open: '09:00', close: '15:00' },
      },
      timezone: 'Europe/Belgrade',
    },
  }, [agent1.address]);

  // ── Offer 7: Provider1, BUY, 200, both agents ──
  // Tests: buyer offer at agents
  await createOffer(prov1, 'Offer 7 (P1 BUY 200 both agents)', 1, '200', '10', 4n, 'USD', {
    location: { lat: 45.2447, lng: 19.8228, radius: 1.5, city: 'Novi Sad', country: 'Serbia' },
    availability: {
      schedule: {
        Mon: { open: '11:00', close: '19:00' },
        Tue: { open: '11:00', close: '19:00' },
        Wed: { open: '11:00', close: '19:00' },
        Thu: { open: '11:00', close: '19:00' },
        Fri: { open: '11:00', close: '19:00' },
      },
      timezone: 'Europe/Belgrade',
    },
  }, [agent1.address, agent2.address]);

  // ── Offer 8: Provider2, BUY, 50, agent2 only ──
  // Tests: small buy, weekend only
  await createOffer(prov2, 'Offer 8 (P2 BUY 50 agent2 weekend)', 1, '50', '5', 2n, 'USD', {
    location: { lat: 45.2362, lng: 19.7086, radius: 2.5, city: 'Novi Sad', country: 'Serbia' },
    availability: {
      schedule: {
        Sat: { open: '11:00', close: '17:00' },
        Sun: { open: '11:00', close: '17:00' },
      },
      timezone: 'Europe/Belgrade',
    },
  }, [agent2.address]);

  // ── Offer 9: Provider1, SELL, 300, direct P2P (no agents) ──
  // Tests: direct mode, no agent
  await createOffer(prov1, 'Offer 9 (P1 SELL 300 direct P2P)', 0, '300', '10', 10n, 'USD', {
    location: { lat: 45.2600, lng: 19.8400, radius: 3, city: 'Novi Sad', country: 'Serbia' },
    availability: {
      schedule: {
        Mon: { open: '12:00', close: '20:00' },
        Tue: { open: '12:00', close: '20:00' },
        Wed: { open: '12:00', close: '20:00' },
        Thu: { open: '12:00', close: '20:00' },
        Fri: { open: '12:00', close: '20:00' },
        Sat: { open: '12:00', close: '20:00' },
      },
      timezone: 'Europe/Belgrade',
    },
  }, []);

  // ── Offer 10: Provider2, BUY, 150, direct P2P (no agents) ──
  // Tests: direct buy, no agent
  await createOffer(prov2, 'Offer 10 (P2 BUY 150 direct P2P)', 1, '150', '10', 6n, 'USD', {
    location: { lat: 45.2480, lng: 19.8550, radius: 2, city: 'Novi Sad', country: 'Serbia' },
    availability: {
      schedule: {
        Mon: { open: '10:00', close: '18:00' },
        Wed: { open: '10:00', close: '18:00' },
        Fri: { open: '10:00', close: '18:00' },
      },
      timezone: 'Europe/Belgrade',
    },
  }, []);

  // ═══════════════════════════════════════════
  // ═══ SUMMARY ═══
  // ═══════════════════════════════════════════

  const agentCount = await market.getAgentCount();
  const offerCount = await market.getOfferCount();
  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log('\n==========================================');
  console.log(`✅ Seeding complete in ${totalTime}s!`);
  console.log(`🏪 Agents: ${agentCount}`);
  console.log(`📋 Offers: ${offerCount}`);
  console.log('==========================================');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ Error:', error);
    process.exit(1);
  });