import { expect } from 'chai';
import { ethers } from 'hardhat';
import { ZKPassportRegistry } from '../typechain-types';

describe('ZKPassportRegistry', function () {
  let registry: ZKPassportRegistry;
  let owner: Awaited<ReturnType<typeof ethers.getSigners>>[0];
  let user1: Awaited<ReturnType<typeof ethers.getSigners>>[0];
  let user2: Awaited<ReturnType<typeof ethers.getSigners>>[0];
  let user3: Awaited<ReturnType<typeof ethers.getSigners>>[0];

  // Sample unique ID hashes (simulating keccak256 of zkpassport unique identifiers)
  const uniqueIdHash1 = ethers.keccak256(ethers.toUtf8Bytes('passport-unique-id-1'));
  const uniqueIdHash2 = ethers.keccak256(ethers.toUtf8Bytes('passport-unique-id-2'));
  const uniqueIdHash3 = ethers.keccak256(ethers.toUtf8Bytes('passport-unique-id-3'));

  // Country codes as bytes2
  const countryUS = ethers.encodeBytes32String('US').slice(0, 6); // 0x5553
  const countryGB = ethers.encodeBytes32String('GB').slice(0, 6); // 0x4742
  const countryNone = '0x0000'; // No country disclosed

  beforeEach(async function () {
    [owner, user1, user2, user3] = await ethers.getSigners();
    const ZKPassportRegistryFactory = await ethers.getContractFactory('ZKPassportRegistry');
    registry = await ZKPassportRegistryFactory.deploy();
  });

  // ═══════════════════════════════════════════
  // ═══ VERSION ═══
  // ═══════════════════════════════════════════

  describe('VERSION', function () {
    it('should return correct version', async function () {
      expect(await registry.VERSION()).to.equal('1.0.0');
    });
  });

  // ═══════════════════════════════════════════
  // ═══ SUBMIT ATTESTATION TESTS ═══
  // ═══════════════════════════════════════════

  describe('submitAttestation', function () {
    it('should submit attestation and emit AttestationSubmitted', async function () {
      const tx = await registry.connect(user1).submitAttestation(uniqueIdHash1, countryUS);
      const receipt = await tx.wait();
      const block = await ethers.provider.getBlock(receipt!.blockNumber);

      await expect(tx)
        .to.emit(registry, 'AttestationSubmitted')
        .withArgs(user1.address, uniqueIdHash1, countryUS, block!.timestamp);
    });

    it('should store attestation data correctly', async function () {
      await registry.connect(user1).submitAttestation(uniqueIdHash1, countryUS);

      const attestation = await registry.attestations(user1.address);
      expect(attestation.uniqueIdHash).to.equal(uniqueIdHash1);
      expect(attestation.countryCode).to.equal(countryUS);
      expect(attestation.verifiedAt).to.be.gt(0);
    });

    it('should store attestation without country code', async function () {
      await registry.connect(user1).submitAttestation(uniqueIdHash1, countryNone);

      const attestation = await registry.attestations(user1.address);
      expect(attestation.uniqueIdHash).to.equal(uniqueIdHash1);
      expect(attestation.countryCode).to.equal(countryNone);
    });

    it('should map uniqueIdHash to wallet', async function () {
      await registry.connect(user1).submitAttestation(uniqueIdHash1, countryUS);

      expect(await registry.uniqueIdToWallet(uniqueIdHash1)).to.equal(user1.address);
    });

    it('should allow different users with different passports', async function () {
      await registry.connect(user1).submitAttestation(uniqueIdHash1, countryUS);
      await registry.connect(user2).submitAttestation(uniqueIdHash2, countryGB);

      expect(await registry.isVerified(user1.address)).to.be.true;
      expect(await registry.isVerified(user2.address)).to.be.true;
    });

    it('should revert with zero uniqueIdHash', async function () {
      await expect(
        registry.connect(user1).submitAttestation(ethers.ZeroHash, countryUS)
      ).to.be.revertedWithCustomError(registry, 'InvalidUniqueIdHash');
    });

    it('should revert if wallet already verified', async function () {
      await registry.connect(user1).submitAttestation(uniqueIdHash1, countryUS);

      await expect(
        registry.connect(user1).submitAttestation(uniqueIdHash2, countryUS)
      ).to.be.revertedWithCustomError(registry, 'AlreadyVerified');
    });

    it('should revert if uniqueIdHash already used by another wallet', async function () {
      await registry.connect(user1).submitAttestation(uniqueIdHash1, countryUS);

      await expect(
        registry.connect(user2).submitAttestation(uniqueIdHash1, countryGB)
      ).to.be.revertedWithCustomError(registry, 'UniqueIdAlreadyUsed');
    });
  });

  // ═══════════════════════════════════════════
  // ═══ REVOKE ATTESTATION TESTS ═══
  // ═══════════════════════════════════════════

  describe('revokeAttestation', function () {
    beforeEach(async function () {
      await registry.connect(user1).submitAttestation(uniqueIdHash1, countryUS);
    });

    it('should revoke attestation and emit AttestationRevoked', async function () {
      const tx = await registry.connect(user1).revokeAttestation();
      const receipt = await tx.wait();
      const block = await ethers.provider.getBlock(receipt!.blockNumber);

      await expect(tx)
        .to.emit(registry, 'AttestationRevoked')
        .withArgs(user1.address, uniqueIdHash1, block!.timestamp);
    });

    it('should clear attestation data', async function () {
      await registry.connect(user1).revokeAttestation();

      const attestation = await registry.attestations(user1.address);
      expect(attestation.uniqueIdHash).to.equal(ethers.ZeroHash);
      expect(attestation.verifiedAt).to.equal(0);
    });

    it('should free uniqueIdHash for re-use', async function () {
      await registry.connect(user1).revokeAttestation();

      expect(await registry.uniqueIdToWallet(uniqueIdHash1)).to.equal(ethers.ZeroAddress);
      expect(await registry.isUniqueIdUsed(uniqueIdHash1)).to.be.false;
    });

    it('should allow wallet migration (revoke and re-submit with new wallet)', async function () {
      // User1 revokes
      await registry.connect(user1).revokeAttestation();

      // User2 can now use the same passport (wallet migration scenario)
      await registry.connect(user2).submitAttestation(uniqueIdHash1, countryUS);

      expect(await registry.isVerified(user1.address)).to.be.false;
      expect(await registry.isVerified(user2.address)).to.be.true;
      expect(await registry.getWalletByUniqueId(uniqueIdHash1)).to.equal(user2.address);
    });

    it('should revert if not verified', async function () {
      await expect(
        registry.connect(user2).revokeAttestation()
      ).to.be.revertedWithCustomError(registry, 'NotVerified');
    });

    it('should revert if already revoked', async function () {
      await registry.connect(user1).revokeAttestation();

      await expect(
        registry.connect(user1).revokeAttestation()
      ).to.be.revertedWithCustomError(registry, 'NotVerified');
    });
  });

  // ═══════════════════════════════════════════
  // ═══ VIEW FUNCTION TESTS ═══
  // ═══════════════════════════════════════════

  describe('isVerified', function () {
    it('should return false for unverified wallet', async function () {
      expect(await registry.isVerified(user1.address)).to.be.false;
    });

    it('should return true for verified wallet', async function () {
      await registry.connect(user1).submitAttestation(uniqueIdHash1, countryUS);

      expect(await registry.isVerified(user1.address)).to.be.true;
    });

    it('should return false after revocation', async function () {
      await registry.connect(user1).submitAttestation(uniqueIdHash1, countryUS);
      await registry.connect(user1).revokeAttestation();

      expect(await registry.isVerified(user1.address)).to.be.false;
    });
  });

  describe('getAttestation', function () {
    it('should return attestation details', async function () {
      await registry.connect(user1).submitAttestation(uniqueIdHash1, countryUS);

      const [uniqueIdHash, verifiedAt, countryCode] = await registry.getAttestation(user1.address);

      expect(uniqueIdHash).to.equal(uniqueIdHash1);
      expect(verifiedAt).to.be.gt(0);
      expect(countryCode).to.equal(countryUS);
    });

    it('should return zeros for unverified wallet', async function () {
      const [uniqueIdHash, verifiedAt, countryCode] = await registry.getAttestation(user1.address);

      expect(uniqueIdHash).to.equal(ethers.ZeroHash);
      expect(verifiedAt).to.equal(0);
      expect(countryCode).to.equal(countryNone);
    });
  });

  describe('isUniqueIdUsed', function () {
    it('should return false for unused uniqueIdHash', async function () {
      expect(await registry.isUniqueIdUsed(uniqueIdHash1)).to.be.false;
    });

    it('should return true for used uniqueIdHash', async function () {
      await registry.connect(user1).submitAttestation(uniqueIdHash1, countryUS);

      expect(await registry.isUniqueIdUsed(uniqueIdHash1)).to.be.true;
    });

    it('should return false after revocation', async function () {
      await registry.connect(user1).submitAttestation(uniqueIdHash1, countryUS);
      await registry.connect(user1).revokeAttestation();

      expect(await registry.isUniqueIdUsed(uniqueIdHash1)).to.be.false;
    });
  });

  describe('getWalletByUniqueId', function () {
    it('should return zero address for unused uniqueIdHash', async function () {
      expect(await registry.getWalletByUniqueId(uniqueIdHash1)).to.equal(ethers.ZeroAddress);
    });

    it('should return wallet address for used uniqueIdHash', async function () {
      await registry.connect(user1).submitAttestation(uniqueIdHash1, countryUS);

      expect(await registry.getWalletByUniqueId(uniqueIdHash1)).to.equal(user1.address);
    });

    it('should return zero address after revocation', async function () {
      await registry.connect(user1).submitAttestation(uniqueIdHash1, countryUS);
      await registry.connect(user1).revokeAttestation();

      expect(await registry.getWalletByUniqueId(uniqueIdHash1)).to.equal(ethers.ZeroAddress);
    });
  });

  // ═══════════════════════════════════════════
  // ═══ EDGE CASES ═══
  // ═══════════════════════════════════════════

  describe('edge cases', function () {
    it('should handle multiple attestations and revocations', async function () {
      // User1 verifies
      await registry.connect(user1).submitAttestation(uniqueIdHash1, countryUS);
      expect(await registry.isVerified(user1.address)).to.be.true;

      // User1 revokes
      await registry.connect(user1).revokeAttestation();
      expect(await registry.isVerified(user1.address)).to.be.false;

      // User1 can re-verify with a different passport
      await registry.connect(user1).submitAttestation(uniqueIdHash2, countryGB);
      expect(await registry.isVerified(user1.address)).to.be.true;

      const [uniqueIdHash, , countryCode] = await registry.getAttestation(user1.address);
      expect(uniqueIdHash).to.equal(uniqueIdHash2);
      expect(countryCode).to.equal(countryGB);
    });

    it('should track multiple users correctly', async function () {
      await registry.connect(user1).submitAttestation(uniqueIdHash1, countryUS);
      await registry.connect(user2).submitAttestation(uniqueIdHash2, countryGB);
      await registry.connect(user3).submitAttestation(uniqueIdHash3, countryNone);

      expect(await registry.isVerified(user1.address)).to.be.true;
      expect(await registry.isVerified(user2.address)).to.be.true;
      expect(await registry.isVerified(user3.address)).to.be.true;

      expect(await registry.getWalletByUniqueId(uniqueIdHash1)).to.equal(user1.address);
      expect(await registry.getWalletByUniqueId(uniqueIdHash2)).to.equal(user2.address);
      expect(await registry.getWalletByUniqueId(uniqueIdHash3)).to.equal(user3.address);
    });

    it('should preserve 1:1:1 relationship (one person, one passport, one wallet)', async function () {
      // User1 registers with passport1
      await registry.connect(user1).submitAttestation(uniqueIdHash1, countryUS);

      // User1 cannot register again (AlreadyVerified)
      await expect(
        registry.connect(user1).submitAttestation(uniqueIdHash2, countryUS)
      ).to.be.revertedWithCustomError(registry, 'AlreadyVerified');

      // User2 cannot use the same passport (UniqueIdAlreadyUsed)
      await expect(
        registry.connect(user2).submitAttestation(uniqueIdHash1, countryUS)
      ).to.be.revertedWithCustomError(registry, 'UniqueIdAlreadyUsed');
    });
  });

});
