import { expect } from 'chai';
import { ethers } from 'hardhat';
import { P2PMarket } from '../typechain-types';

describe('P2PMarket', function () {
  let market: P2PMarket;
  let owner: Awaited<ReturnType<typeof ethers.getSigners>>[0];
  let agent1: Awaited<ReturnType<typeof ethers.getSigners>>[0];
  let agent2: Awaited<ReturnType<typeof ethers.getSigners>>[0];
  let provider: Awaited<ReturnType<typeof ethers.getSigners>>[0];
  let buyer: Awaited<ReturnType<typeof ethers.getSigners>>[0];

  beforeEach(async function () {
    [owner, agent1, agent2, provider, buyer] = await ethers.getSigners();
    const P2PMarketFactory = await ethers.getContractFactory('P2PMarket');
    market = await P2PMarketFactory.deploy();
  });

  // ═══════════════════════════════════════════
  // ═══ AGENT REGISTRY TESTS ═══
  // ═══════════════════════════════════════════

  describe('registerAgent', function () {
    it('should register agent and emit AgentRegistered', async function () {
      await expect(
        market.connect(agent1).registerAgent('Mikro Market', 'QmAgent1', 5n, 4n, 0n)
      )
        .to.emit(market, 'AgentRegistered')
        .withArgs(agent1.address, 'Mikro Market', 5n, 'QmAgent1', 4n, 0n);
    });

    it('should store agent data correctly', async function () {
      await market.connect(agent1).registerAgent('Downtown Exchange', 'QmAgent1', 10n, 4n, 0n);

      const agent = await market.getAgent(agent1.address);
      expect(agent.wallet).to.equal(agent1.address);
      expect(agent.name).to.equal('Downtown Exchange');
      expect(agent.metadataCID).to.equal('QmAgent1');
      expect(agent.flatFee).to.equal(10n);
      expect(agent.active).to.be.true;
      expect(agent.registeredAt).to.be.gt(0);
    });

    it('should add agent to agentList', async function () {
      await market.connect(agent1).registerAgent('Agent A', 'QmA', 5n, 4n, 0n);
      await market.connect(agent2).registerAgent('Agent B', 'QmB', 3n, 4n, 0n);

      expect(await market.getAgentCount()).to.equal(2n);
    });

    it('should revert if already registered', async function () {
      await market.connect(agent1).registerAgent('Agent A', 'QmA', 5n, 4n, 0n);
      await expect(
        market.connect(agent1).registerAgent('Agent A Again', 'QmA2', 5n, 4n, 0n)
      ).to.be.revertedWithCustomError(market, 'AgentAlreadyRegistered');
    });

    it('should revert with empty name', async function () {
      await expect(
        market.connect(agent1).registerAgent('', 'QmA', 5n, 4n, 0n)
      ).to.be.revertedWithCustomError(market, 'InvalidName');
    });

    it('should revert with empty metadataCID', async function () {
      await expect(
        market.connect(agent1).registerAgent('Agent', '', 5n, 4n, 0n)
      ).to.be.revertedWithCustomError(market, 'InvalidMetadataCID');
    });

    it('should revert when flatFee exceeds MAX_FLAT_FEE', async function () {
      await expect(
        market.connect(agent1).registerAgent('Agent', 'QmA', 1001n, 4n, 0n)
      ).to.be.revertedWithCustomError(market, 'FlatFeeTooHigh');
    });
  });

  describe('updateAgent', function () {
    beforeEach(async function () {
      await market.connect(agent1).registerAgent('Old Name', 'QmOld', 5n, 4n, 0n);
    });

    it('should update agent info and emit AgentUpdated', async function () {
      await expect(
        market.connect(agent1).updateAgent('New Name', 'QmNew', 8n, 4n, 0n)
      )
        .to.emit(market, 'AgentUpdated')
        .withArgs(agent1.address, 'New Name', 8n, 'QmNew', 4n, 0n);

      const agent = await market.getAgent(agent1.address);
      expect(agent.name).to.equal('New Name');
      expect(agent.metadataCID).to.equal('QmNew');
      expect(agent.flatFee).to.equal(8n);
    });

    it('should revert if not registered', async function () {
      await expect(
        market.connect(agent2).updateAgent('Name', 'Qm', 5n, 4n, 0n)
      ).to.be.revertedWithCustomError(market, 'AgentNotRegistered');
    });
  });

  describe('deactivateAgent', function () {
    beforeEach(async function () {
      await market.connect(agent1).registerAgent('Agent A', 'QmA', 5n, 4n, 0n);
      await market.connect(agent2).registerAgent('Agent B', 'QmB', 3n, 4n, 0n);
    });

    it('should deactivate agent and emit AgentDeactivated', async function () {
      await expect(market.connect(agent1).deactivateAgent())
        .to.emit(market, 'AgentDeactivated')
        .withArgs(agent1.address);

      const agent = await market.getAgent(agent1.address);
      expect(agent.active).to.be.false;
    });

    it('should remove agent from agentList', async function () {
      expect(await market.getAgentCount()).to.equal(2n);
      await market.connect(agent1).deactivateAgent();
      expect(await market.getAgentCount()).to.equal(1n);
    });

    it('should revert if not registered', async function () {
      await expect(
        market.connect(provider).deactivateAgent()
      ).to.be.revertedWithCustomError(market, 'AgentNotRegistered');
    });

    it('should revert if already deactivated', async function () {
      await market.connect(agent1).deactivateAgent();
      await expect(
        market.connect(agent1).deactivateAgent()
      ).to.be.revertedWithCustomError(market, 'AgentNotActive');
    });

    it('should preserve offer links (agent stays in agentAddresses)', async function () {
      await market.connect(provider).createOffer(
        0, ethers.parseEther('100'), ethers.parseEther('10'), 12n, 'USD', 'QmOffer',
        [agent1.address, agent2.address]
      );

      await market.connect(agent1).deactivateAgent();

      // Offer still has both addresses stored
      const offer = await market.getOffer(1n);
      expect(offer.agentAddresses).to.have.lengthOf(2);
    });

    it('getOffersByAgent should filter out expired offers but keep valid ones for deactivated agent', async function () {
      await market.connect(provider).createOffer(
        0, ethers.parseEther('100'), ethers.parseEther('10'), 12n, 'USD', 'Qm1',
        [agent1.address]
      );

      await market.connect(agent1).deactivateAgent();

      // getOffersByAgent still returns the offer (it filters by expired/deleted, not agent active)
      const agentOfferIds = await market.getOffersByAgent(agent1.address);
      expect(agentOfferIds).to.have.lengthOf(1);
    });
  });

  describe('reactivateAgent', function () {
    beforeEach(async function () {
      await market.connect(agent1).registerAgent('Agent A', 'QmA', 5n, 4n, 0n);
      await market.connect(agent1).deactivateAgent();
    });

    it('should reactivate agent and re-add to agentList', async function () {
      await market.connect(agent1).reactivateAgent();

      const agent = await market.getAgent(agent1.address);
      expect(agent.active).to.be.true;
      expect(await market.getAgentCount()).to.equal(1n);
    });

    it('should restore offer links after reactivation', async function () {
      // Create offer linked to agent1 before deactivation
      // Need to register agent2 first to create the offer
      await market.connect(agent2).registerAgent('Agent B', 'QmB', 3n, 4n, 0n);
      // agent1 is deactivated, so we can't link new offers to it
      // But offers created before deactivation survive
      // Let's test with a fresh flow:
      await market.connect(agent1).reactivateAgent();

      await market.connect(provider).createOffer(
        0, ethers.parseEther('100'), ethers.parseEther('10'), 12n, 'USD', 'QmOffer',
        [agent1.address]
      );

      // Deactivate and reactivate
      await market.connect(agent1).deactivateAgent();
      const duringDeactivation = await market.getAllAgents();
      expect(duringDeactivation).to.have.lengthOf(1); // only agent2

      await market.connect(agent1).reactivateAgent();
      const afterReactivation = await market.getAllAgents();
      expect(afterReactivation).to.have.lengthOf(2); // both agents

      // Offer link preserved
      const agentOfferIds = await market.getOffersByAgent(agent1.address);
      expect(agentOfferIds).to.have.lengthOf(1);
    });

    it('should revert if already active', async function () {
      await market.connect(agent1).reactivateAgent();
      await expect(
        market.connect(agent1).reactivateAgent()
      ).to.be.revertedWithCustomError(market, 'AgentAlreadyActive');
    });

    it('should revert if not registered', async function () {
      await expect(
        market.connect(provider).reactivateAgent()
      ).to.be.revertedWithCustomError(market, 'AgentNotRegistered');
    });
  });

  describe('removeAgent', function () {
    beforeEach(async function () {
      await market.connect(agent1).registerAgent('Agent A', 'QmA', 5n, 4n, 0n);
      await market.connect(agent2).registerAgent('Agent B', 'QmB', 3n, 4n, 0n);
    });

    it('should permanently remove agent and emit AgentRemoved', async function () {
      await expect(market.connect(agent1).removeAgent())
        .to.emit(market, 'AgentRemoved')
        .withArgs(agent1.address);

      await expect(market.getAgent(agent1.address))
        .to.be.revertedWithCustomError(market, 'AgentNotRegistered');
    });

    it('should remove agent from all offers agentAddresses', async function () {
      await market.connect(provider).createOffer(
        0, ethers.parseEther('100'), ethers.parseEther('10'), 12n, 'USD', 'QmOffer',
        [agent1.address, agent2.address]
      );

      await market.connect(agent1).removeAgent();

      const offer = await market.getOffer(1n);
      expect(offer.agentAddresses).to.have.lengthOf(1);
      expect(offer.agentAddresses[0]).to.equal(agent2.address);
    });

    it('should clear agentOffers reverse mapping', async function () {
      await market.connect(provider).createOffer(
        0, ethers.parseEther('100'), ethers.parseEther('10'), 12n, 'USD', 'Qm1',
        [agent1.address]
      );
      await market.connect(provider).createOffer(
        0, ethers.parseEther('200'), ethers.parseEther('20'), 5n, 'USD', 'Qm2',
        [agent1.address]
      );

      await market.connect(agent1).removeAgent();

      const agentOfferIds = await market.getOffersByAgent(agent1.address);
      expect(agentOfferIds).to.have.lengthOf(0);
    });

    it('should work on already deactivated agent', async function () {
      await market.connect(agent1).deactivateAgent();
      await expect(market.connect(agent1).removeAgent())
        .to.emit(market, 'AgentRemoved');

      await expect(market.getAgent(agent1.address))
        .to.be.revertedWithCustomError(market, 'AgentNotRegistered');
    });

    it('should not affect other agents on the same offer', async function () {
      await market.connect(provider).createOffer(
        0, ethers.parseEther('100'), ethers.parseEther('10'), 12n, 'USD', 'QmOffer',
        [agent1.address, agent2.address]
      );

      await market.connect(agent1).removeAgent();

      const agent2Offers = await market.getOffersByAgent(agent2.address);
      expect(agent2Offers).to.have.lengthOf(1);
    });

    it('should revert if not registered', async function () {
      await expect(
        market.connect(provider).removeAgent()
      ).to.be.revertedWithCustomError(market, 'AgentNotRegistered');
    });
  });

  describe('getAllAgents', function () {
    it('should return all active agents', async function () {
      await market.connect(agent1).registerAgent('Agent A', 'QmA', 5n, 4n, 0n);
      await market.connect(agent2).registerAgent('Agent B', 'QmB', 3n, 4n, 0n);

      const agents = await market.getAllAgents();
      expect(agents).to.have.lengthOf(2);
      expect(agents[0].name).to.equal('Agent A');
      expect(agents[1].name).to.equal('Agent B');
    });

    it('should return empty array when no agents', async function () {
      const agents = await market.getAllAgents();
      expect(agents).to.have.lengthOf(0);
    });

    it('should exclude deactivated agents', async function () {
      await market.connect(agent1).registerAgent('Agent A', 'QmA', 5n, 4n, 0n);
      await market.connect(agent2).registerAgent('Agent B', 'QmB', 3n, 4n, 0n);
      await market.connect(agent1).deactivateAgent();

      const agents = await market.getAllAgents();
      expect(agents).to.have.lengthOf(1);
      expect(agents[0].name).to.equal('Agent B');
    });
  });

  // ═══════════════════════════════════════════
  // ═══ AGENT INSURANCE (STAKING) TESTS ═══
  // ═══════════════════════════════════════════

  describe('Agent Insurance (Staking)', function () {
    describe('registerAgent with stake', function () {
      it('should set stakedAmount when registering with value', async function () {
        const stakeAmount = ethers.parseEther('10');
        await market.connect(agent1).registerAgent('Staked Agent', 'QmA', 5n, 4n, 0n, { value: stakeAmount });

        const agent = await market.getAgent(agent1.address);
        expect(agent.stakedAmount).to.equal(stakeAmount);
      });

      it('should emit InsuranceStaked when registering with value', async function () {
        const stakeAmount = ethers.parseEther('5');
        await expect(
          market.connect(agent1).registerAgent('Staked Agent', 'QmA', 5n, 4n, 0n, { value: stakeAmount })
        )
          .to.emit(market, 'InsuranceStaked')
          .withArgs(agent1.address, stakeAmount, stakeAmount);
      });

      it('should not emit InsuranceStaked when registering with zero value', async function () {
        await expect(
          market.connect(agent1).registerAgent('Free Agent', 'QmA', 5n, 4n, 0n)
        ).to.not.emit(market, 'InsuranceStaked');
      });

      it('should set stakedAmount to 0 when registering without value', async function () {
        await market.connect(agent1).registerAgent('Free Agent', 'QmA', 5n, 4n, 0n);

        const agent = await market.getAgent(agent1.address);
        expect(agent.stakedAmount).to.equal(0n);
      });

      it('should hold the staked PAS in the contract', async function () {
        const stakeAmount = ethers.parseEther('10');
        const balanceBefore = await ethers.provider.getBalance(await market.getAddress());
        await market.connect(agent1).registerAgent('Agent', 'QmA', 5n, 4n, 0n, { value: stakeAmount });
        const balanceAfter = await ethers.provider.getBalance(await market.getAddress());
        expect(balanceAfter - balanceBefore).to.equal(stakeAmount);
      });
    });

    describe('stakeInsurance', function () {
      beforeEach(async function () {
        await market.connect(agent1).registerAgent('Agent A', 'QmA', 5n, 4n, 0n, { value: ethers.parseEther('5') });
      });

      it('should add to existing stake', async function () {
        const additionalStake = ethers.parseEther('3');
        await market.connect(agent1).stakeInsurance({ value: additionalStake });

        const agent = await market.getAgent(agent1.address);
        expect(agent.stakedAmount).to.equal(ethers.parseEther('8'));
      });

      it('should emit InsuranceStaked with correct total', async function () {
        const additionalStake = ethers.parseEther('3');
        await expect(
          market.connect(agent1).stakeInsurance({ value: additionalStake })
        )
          .to.emit(market, 'InsuranceStaked')
          .withArgs(agent1.address, additionalStake, ethers.parseEther('8'));
      });

      it('should revert if not registered', async function () {
        await expect(
          market.connect(provider).stakeInsurance({ value: ethers.parseEther('1') })
        ).to.be.revertedWithCustomError(market, 'AgentNotRegistered');
      });

      it('should revert with zero value', async function () {
        await expect(
          market.connect(agent1).stakeInsurance({ value: 0n })
        ).to.be.revertedWithCustomError(market, 'InvalidAmount');
      });
    });

    describe('unstakeInsurance', function () {
      beforeEach(async function () {
        await market.connect(agent1).registerAgent('Agent A', 'QmA', 5n, 4n, 0n, { value: ethers.parseEther('10') });
      });

      it('should withdraw partial stake', async function () {
        const withdrawAmount = ethers.parseEther('4');
        await market.connect(agent1).unstakeInsurance(withdrawAmount);

        const agent = await market.getAgent(agent1.address);
        expect(agent.stakedAmount).to.equal(ethers.parseEther('6'));
      });

      it('should transfer PAS to agent', async function () {
        const withdrawAmount = ethers.parseEther('4');
        const balanceBefore = await ethers.provider.getBalance(agent1.address);
        const tx = await market.connect(agent1).unstakeInsurance(withdrawAmount);
        const receipt = await tx.wait();
        const gasCost = receipt!.gasUsed * receipt!.gasPrice;
        const balanceAfter = await ethers.provider.getBalance(agent1.address);
        expect(balanceAfter - balanceBefore + gasCost).to.equal(withdrawAmount);
      });

      it('should withdraw full stake', async function () {
        await market.connect(agent1).unstakeInsurance(ethers.parseEther('10'));

        const agent = await market.getAgent(agent1.address);
        expect(agent.stakedAmount).to.equal(0n);
      });

      it('should emit InsuranceUnstaked with correct total', async function () {
        const withdrawAmount = ethers.parseEther('4');
        await expect(
          market.connect(agent1).unstakeInsurance(withdrawAmount)
        )
          .to.emit(market, 'InsuranceUnstaked')
          .withArgs(agent1.address, withdrawAmount, ethers.parseEther('6'));
      });

      it('should revert if not registered', async function () {
        await expect(
          market.connect(provider).unstakeInsurance(ethers.parseEther('1'))
        ).to.be.revertedWithCustomError(market, 'AgentNotRegistered');
      });

      it('should revert if no stake', async function () {
        await market.connect(agent2).registerAgent('Agent B', 'QmB', 3n, 4n, 0n);
        await expect(
          market.connect(agent2).unstakeInsurance(ethers.parseEther('1'))
        ).to.be.revertedWithCustomError(market, 'NoInsuranceToWithdraw');
      });

      it('should revert if amount exceeds stake', async function () {
        await expect(
          market.connect(agent1).unstakeInsurance(ethers.parseEther('11'))
        ).to.be.revertedWithCustomError(market, 'InsufficientInsurance');
      });
    });

    describe('removeAgent refunds stake', function () {
      it('should refund staked amount when removing', async function () {
        const stakeAmount = ethers.parseEther('10');
        await market.connect(agent1).registerAgent('Agent', 'QmA', 5n, 4n, 0n, { value: stakeAmount });

        const balanceBefore = await ethers.provider.getBalance(agent1.address);
        const tx = await market.connect(agent1).removeAgent();
        const receipt = await tx.wait();
        const gasCost = receipt!.gasUsed * receipt!.gasPrice;
        const balanceAfter = await ethers.provider.getBalance(agent1.address);

        expect(balanceAfter - balanceBefore + gasCost).to.equal(stakeAmount);
      });

      it('should work when removing agent with zero stake', async function () {
        await market.connect(agent1).registerAgent('Agent', 'QmA', 5n, 4n, 0n);
        await expect(market.connect(agent1).removeAgent())
          .to.emit(market, 'AgentRemoved');
      });
    });

    describe('deactivateAgent preserves stake', function () {
      it('should keep stakedAmount after deactivation', async function () {
        const stakeAmount = ethers.parseEther('10');
        await market.connect(agent1).registerAgent('Agent', 'QmA', 5n, 4n, 0n, { value: stakeAmount });
        await market.connect(agent1).deactivateAgent();

        const agent = await market.getAgent(agent1.address);
        expect(agent.stakedAmount).to.equal(stakeAmount);
      });
    });

    describe('getAllAgents includes stakedAmount', function () {
      it('should return stakedAmount in agent structs', async function () {
        await market.connect(agent1).registerAgent('Agent A', 'QmA', 5n, 4n, 0n, { value: ethers.parseEther('10') });
        await market.connect(agent2).registerAgent('Agent B', 'QmB', 3n, 4n, 0n, { value: ethers.parseEther('20') });

        const agents = await market.getAllAgents();
        expect(agents[0].stakedAmount).to.equal(ethers.parseEther('10'));
        expect(agents[1].stakedAmount).to.equal(ethers.parseEther('20'));
      });
    });
  });

  // ═══════════════════════════════════════════
  // ═══ OFFER TESTS (updated for agents[]) ═══
  // ═══════════════════════════════════════════

  describe('createOffer', function () {
    it('should create offer without agents and emit OfferCreated', async function () {
      const amountAvailable = ethers.parseEther('100');
      const minAmount = ethers.parseEther('10');
      const flatFee = 12n;
      const fiatCurrency = 'USD';
      const locationCID = 'QmTest123';

      await expect(
        market.createOffer(0, amountAvailable, minAmount, flatFee, fiatCurrency, locationCID, [])
      )
        .to.emit(market, 'OfferCreated')
        .withArgs(1n, owner.address, 0, amountAvailable, minAmount, 100n, fiatCurrency, flatFee, locationCID);
    });

    it('should return offerId and store offer', async function () {
      const amountAvailable = ethers.parseEther('50');
      const minAmount = ethers.parseEther('5');
      const tx = await market.createOffer(0, amountAvailable, minAmount, 12n, 'USD', 'QmLocation456', []);
      const receipt = await tx.wait();
      expect(receipt).to.not.be.null;

      const offerId = await market.offerCounter();
      expect(offerId).to.equal(1n);

      const offer = await market.getOffer(1n);
      expect(offer.id).to.equal(1n);
      expect(offer.owner).to.equal(owner.address);
      expect(offer.offerType).to.equal(0);
      expect(offer.amountAvailable).to.equal(amountAvailable);
      expect(offer.minAmount).to.equal(minAmount);
      expect(offer.pricePerToken).to.equal(100);
      expect(offer.fiatCurrency).to.equal('USD');
      expect(offer.flatFee).to.equal(12n);
      expect(offer.metadataCID).to.equal('QmLocation456');
      expect(offer.active).to.be.true;
      expect(offer.createdAt).to.be.gt(0);
      expect(offer.agentAddresses).to.have.lengthOf(0);
    });

    it('should add offer to userOffers', async function () {
      await market.createOffer(0, ethers.parseEther('100'), ethers.parseEther('10'), 0n, 'USD', 'QmRSD', []);

      const userOffers = await market.getUserOffers(owner.address);
      expect(userOffers).to.have.lengthOf(1);
      expect(userOffers[0]).to.equal(1n);
    });

    it('should increment offerCounter for multiple offers', async function () {
      await market.createOffer(0, ethers.parseEther('100'), ethers.parseEther('10'), 12n, 'USD', 'Qm1', []);
      await market.createOffer(0, ethers.parseEther('200'), ethers.parseEther('20'), 5n, 'USD', 'Qm2', []);

      expect(await market.offerCounter()).to.equal(2n);
      expect(await market.getOfferCount()).to.equal(2n);
    });

    it('should revert when amountAvailable is zero', async function () {
      await expect(
        market.createOffer(0, 0n, ethers.parseEther('10'), 12n, 'USD', 'Qm', [])
      ).to.be.revertedWithCustomError(market, 'InvalidAmount');
    });

    it('should revert when minAmount is zero', async function () {
      await expect(
        market.createOffer(0, ethers.parseEther('100'), 0n, 12n, 'USD', 'Qm', [])
      ).to.be.revertedWithCustomError(market, 'InvalidMinAmount');
    });

    it('should revert when minAmount > amountAvailable', async function () {
      await expect(
        market.createOffer(0, ethers.parseEther('10'), ethers.parseEther('100'), 12n, 'USD', 'Qm', [])
      ).to.be.revertedWithCustomError(market, 'InvalidAmount');
    });

    it('should revert when fiatCurrency is empty', async function () {
      await expect(
        market.createOffer(0, ethers.parseEther('100'), ethers.parseEther('10'), 12n, '', 'Qm', [])
      ).to.be.revertedWithCustomError(market, 'InvalidCurrency');
    });

    it('should revert when metadataCID is empty', async function () {
      await expect(
        market.createOffer(0, ethers.parseEther('100'), ethers.parseEther('10'), 12n, 'USD', '', [])
      ).to.be.revertedWithCustomError(market, 'InvalidMetadataCID');
    });

    it('should revert when flatFee exceeds MAX_FLAT_FEE', async function () {
      await expect(
        market.createOffer(0, ethers.parseEther('100'), ethers.parseEther('10'), 1001n, 'USD', 'Qm', [])
      ).to.be.revertedWithCustomError(market, 'FlatFeeTooHigh');
    });

    it('should revert when fiatCurrency is not supported', async function () {
      await expect(
        market.createOffer(0, ethers.parseEther('100'), ethers.parseEther('10'), 12n, 'XXX', 'Qm', [])
      ).to.be.revertedWithCustomError(market, 'CurrencyNotSupported');
    });
  });

  describe('createOffer BUY', function () {
    it('should create buyer offer with offerType=1', async function () {
      const amountAvailable = ethers.parseEther('500');
      const minAmount = ethers.parseEther('100');
      const flatFee = 12n;
      const fiatCurrency = 'USD';
      const metadataCID = 'QmBuyer1';

      await expect(
        market.createOffer(1, amountAvailable, minAmount, flatFee, fiatCurrency, metadataCID, [])
      )
        .to.emit(market, 'OfferCreated')
        .withArgs(1n, owner.address, 1, amountAvailable, minAmount, 100n, fiatCurrency, flatFee, metadataCID);

      const offer = await market.getOffer(1n);
      expect(offer.offerType).to.equal(1);
      expect(offer.amountAvailable).to.equal(amountAvailable);
      expect(offer.minAmount).to.equal(minAmount);
      expect(offer.flatFee).to.equal(flatFee);
    });
  });

  // ═══════════════════════════════════════════
  // ═══ OFFER-AGENT LINKING TESTS ═══
  // ═══════════════════════════════════════════

  describe('offer-agent linking', function () {
    beforeEach(async function () {
      await market.connect(agent1).registerAgent('Agent A', 'QmA', 5n, 4n, 0n);
      await market.connect(agent2).registerAgent('Agent B', 'QmB', 3n, 4n, 0n);
    });

    it('should link offer to agents and store in agentAddresses', async function () {
      await market.connect(provider).createOffer(
        0, ethers.parseEther('100'), ethers.parseEther('10'), 12n, 'USD', 'QmOffer1',
        [agent1.address, agent2.address]
      );

      const offer = await market.getOffer(1n);
      expect(offer.agentAddresses).to.have.lengthOf(2);
      expect(offer.agentAddresses[0]).to.equal(agent1.address);
      expect(offer.agentAddresses[1]).to.equal(agent2.address);
    });

    it('should populate reverse mapping agentOffers', async function () {
      await market.connect(provider).createOffer(
        0, ethers.parseEther('100'), ethers.parseEther('10'), 12n, 'USD', 'QmOffer1',
        [agent1.address, agent2.address]
      );
      await market.connect(provider).createOffer(
        0, ethers.parseEther('200'), ethers.parseEther('20'), 5n, 'USD', 'QmOffer2',
        [agent1.address]
      );

      const agent1Offers = await market.getOffersByAgent(agent1.address);
      expect(agent1Offers).to.have.lengthOf(2);
      expect(agent1Offers[0]).to.equal(1n);
      expect(agent1Offers[1]).to.equal(2n);

      const agent2Offers = await market.getOffersByAgent(agent2.address);
      expect(agent2Offers).to.have.lengthOf(1);
      expect(agent2Offers[0]).to.equal(1n);
    });

    it('should allow offer with no agents (direct P2P)', async function () {
      await market.connect(provider).createOffer(
        0, ethers.parseEther('100'), ethers.parseEther('10'), 12n, 'USD', 'QmP2P', []
      );

      const offer = await market.getOffer(1n);
      expect(offer.agentAddresses).to.have.lengthOf(0);
    });

    it('should revert when agent is not registered', async function () {
      await expect(
        market.connect(provider).createOffer(
          0, ethers.parseEther('100'), ethers.parseEther('10'), 12n, 'USD', 'QmOffer',
          [provider.address] // provider is not an agent
        )
      ).to.be.revertedWithCustomError(market, 'AgentNotRegistered');
    });

    it('should revert when agent is deactivated', async function () {
      await market.connect(agent1).deactivateAgent();

      await expect(
        market.connect(provider).createOffer(
          0, ethers.parseEther('100'), ethers.parseEther('10'), 12n, 'USD', 'QmOffer',
          [agent1.address]
        )
      ).to.be.revertedWithCustomError(market, 'AgentNotActive');
    });
  });

  // ═══════════════════════════════════════════
  // ═══ ADD AGENT TO OFFER TESTS ═══
  // ═══════════════════════════════════════════

  describe('addAgentToOffer', function () {
    beforeEach(async function () {
      await market.connect(agent1).registerAgent('Agent A', 'QmA', 5n, 4n, 0n);
      await market.connect(agent2).registerAgent('Agent B', 'QmB', 3n, 4n, 0n);
      // Offer created with only agent1 linked.
      await market.connect(provider).createOffer(
        0, ethers.parseEther('100'), ethers.parseEther('10'), 12n, 'USD', 'QmOffer1',
        [agent1.address]
      );
    });

    it('should add a new agent and emit OfferAgentAdded', async function () {
      await expect(market.connect(provider).addAgentToOffer(1n, agent2.address))
        .to.emit(market, 'OfferAgentAdded')
        .withArgs(1n, agent2.address);

      const offer = await market.getOffer(1n);
      expect(offer.agentAddresses).to.have.lengthOf(2);
      expect(offer.agentAddresses[1]).to.equal(agent2.address);
    });

    it('should update the reverse agentOffers mapping', async function () {
      await market.connect(provider).addAgentToOffer(1n, agent2.address);
      const agent2Offers = await market.getOffersByAgent(agent2.address);
      expect(agent2Offers).to.have.lengthOf(1);
      expect(agent2Offers[0]).to.equal(1n);
    });

    it('should revert if caller is not the offer owner', async function () {
      await expect(
        market.connect(buyer).addAgentToOffer(1n, agent2.address)
      ).to.be.revertedWithCustomError(market, 'NotOfferOwner');
    });

    it('should revert if the offer does not exist', async function () {
      await expect(
        market.connect(provider).addAgentToOffer(999n, agent2.address)
      ).to.be.revertedWithCustomError(market, 'OfferNotFound');
    });

    it('should revert if the agent is already on the offer', async function () {
      await expect(
        market.connect(provider).addAgentToOffer(1n, agent1.address)
      ).to.be.revertedWithCustomError(market, 'AgentAlreadyOnOffer');
    });

    it('should revert if the agent is not registered', async function () {
      await expect(
        market.connect(provider).addAgentToOffer(1n, buyer.address)
      ).to.be.revertedWithCustomError(market, 'AgentNotRegistered');
    });

    it('should revert if the agent is deactivated', async function () {
      await market.connect(agent2).deactivateAgent();
      await expect(
        market.connect(provider).addAgentToOffer(1n, agent2.address)
      ).to.be.revertedWithCustomError(market, 'AgentNotActive');
    });

    it('should revert if the offer has expired', async function () {
      await ethers.provider.send('evm_increaseTime', [15 * 24 * 60 * 60]);
      await ethers.provider.send('evm_mine', []);
      await expect(
        market.connect(provider).addAgentToOffer(1n, agent2.address)
      ).to.be.revertedWithCustomError(market, 'OfferExpiredError');
    });

    it('should add an agent to a direct offer that started with zero agents', async function () {
      // Offer #2: direct P2P, no agents at creation.
      await market.connect(provider).createOffer(
        0, ethers.parseEther('50'), ethers.parseEther('5'), 8n, 'USD', 'QmDirect', []
      );
      await market.connect(provider).addAgentToOffer(2n, agent1.address);

      const offer = await market.getOffer(2n);
      expect(offer.agentAddresses).to.have.lengthOf(1);
      expect(offer.agentAddresses[0]).to.equal(agent1.address);
      const agent1Offers = await market.getOffersByAgent(agent1.address);
      expect(agent1Offers.map((x) => x)).to.include(2n);
    });

    it('should append multiple distinct agents preserving order', async function () {
      const agent3 = (await ethers.getSigners())[5];
      await market.connect(agent3).registerAgent('Agent C', 'QmC', 7n, 4n, 0n);

      await market.connect(provider).addAgentToOffer(1n, agent2.address);
      await market.connect(provider).addAgentToOffer(1n, agent3.address);

      const offer = await market.getOffer(1n);
      expect(offer.agentAddresses).to.deep.equal([
        agent1.address,
        agent2.address,
        agent3.address,
      ]);
      expect(await market.getOffersByAgent(agent3.address)).to.deep.equal([1n]);
    });
  });

  // ═══════════════════════════════════════════
  // ═══ REMOVE OFFER TESTS ═══
  // ═══════════════════════════════════════════

  describe('removeOffer', function () {
    beforeEach(async function () {
      await market.connect(agent1).registerAgent('Agent A', 'QmA', 5n, 4n, 0n);
      await market.connect(agent2).registerAgent('Agent B', 'QmB', 3n, 4n, 0n);
    });

    it('should remove offer and emit OfferRemoved', async function () {
      await market.connect(provider).createOffer(
        0, ethers.parseEther('100'), ethers.parseEther('10'), 12n, 'USD', 'QmOffer1', []
      );

      await expect(market.connect(provider).removeOffer(1n))
        .to.emit(market, 'OfferRemoved')
        .withArgs(1n, provider.address);

      await expect(market.getOffer(1n)).to.be.revertedWithCustomError(market, 'OfferNotFound');
    });

    it('should clean userOffers after removal', async function () {
      await market.connect(provider).createOffer(
        0, ethers.parseEther('100'), ethers.parseEther('10'), 12n, 'USD', 'Qm1', []
      );
      await market.connect(provider).createOffer(
        0, ethers.parseEther('200'), ethers.parseEther('20'), 5n, 'USD', 'Qm2', []
      );

      await market.connect(provider).removeOffer(1n);

      const userOfferIds = await market.getUserOffers(provider.address);
      expect(userOfferIds).to.have.lengthOf(1);
      expect(userOfferIds[0]).to.equal(2n);
    });

    it('should clean agentOffers reverse mapping after removal', async function () {
      await market.connect(provider).createOffer(
        0, ethers.parseEther('100'), ethers.parseEther('10'), 12n, 'USD', 'Qm1',
        [agent1.address, agent2.address]
      );
      await market.connect(provider).createOffer(
        0, ethers.parseEther('200'), ethers.parseEther('20'), 5n, 'USD', 'Qm2',
        [agent1.address]
      );

      await market.connect(provider).removeOffer(1n);

      const agent1Offers = await market.getOffersByAgent(agent1.address);
      expect(agent1Offers).to.have.lengthOf(1);
      expect(agent1Offers[0]).to.equal(2n);

      const agent2Offers = await market.getOffersByAgent(agent2.address);
      expect(agent2Offers).to.have.lengthOf(0);
    });

    it('should exclude removed offers from getAllOffers', async function () {
      await market.connect(provider).createOffer(
        0, ethers.parseEther('100'), ethers.parseEther('10'), 12n, 'USD', 'Qm1', []
      );
      await market.connect(provider).createOffer(
        0, ethers.parseEther('200'), ethers.parseEther('20'), 5n, 'USD', 'Qm2', []
      );

      await market.connect(provider).removeOffer(1n);

      const allOffers = await market.getAllOffers();
      expect(allOffers).to.have.lengthOf(1);
      expect(allOffers[0].id).to.equal(2n);
    });

    it('should revert if not offer owner', async function () {
      await market.connect(provider).createOffer(
        0, ethers.parseEther('100'), ethers.parseEther('10'), 12n, 'USD', 'Qm1', []
      );

      await expect(
        market.connect(owner).removeOffer(1n)
      ).to.be.revertedWithCustomError(market, 'NotOfferOwner');
    });

    it('should revert if offer does not exist', async function () {
      await expect(
        market.connect(provider).removeOffer(999n)
      ).to.be.revertedWithCustomError(market, 'OfferNotFound');
    });
  });

  // ═══════════════════════════════════════════
  // ═══ OFFER EXPIRY TESTS ═══
  // ═══════════════════════════════════════════

  describe('offer expiry', function () {
    it('should not be expired immediately after creation', async function () {
      await market.createOffer(0, ethers.parseEther('100'), ethers.parseEther('10'), 12n, 'USD', 'Qm', []);
      expect(await market.isOfferExpired(1n)).to.be.false;
    });

    it('should be expired after OFFER_TTL', async function () {
      await market.createOffer(0, ethers.parseEther('100'), ethers.parseEther('10'), 12n, 'USD', 'Qm', []);

      // Fast-forward 15 days
      await ethers.provider.send('evm_increaseTime', [15 * 24 * 60 * 60]);
      await ethers.provider.send('evm_mine', []);

      expect(await market.isOfferExpired(1n)).to.be.true;
    });

    it('getAllOffers should exclude expired offers', async function () {
      await market.createOffer(0, ethers.parseEther('100'), ethers.parseEther('10'), 12n, 'USD', 'QmOld', []);

      // Fast-forward 15 days
      await ethers.provider.send('evm_increaseTime', [15 * 24 * 60 * 60]);
      await ethers.provider.send('evm_mine', []);

      // Create a fresh offer (not expired)
      await market.createOffer(0, ethers.parseEther('200'), ethers.parseEther('20'), 5n, 'USD', 'QmNew', []);

      const allOffers = await market.getAllOffers();
      expect(allOffers).to.have.lengthOf(1);
      expect(allOffers[0].fiatCurrency).to.equal('USD');
    });

    it('getOffersByAgent should exclude expired offers', async function () {
      await market.connect(agent1).registerAgent('Agent A', 'QmA', 5n, 4n, 0n);
      await market.createOffer(
        0, ethers.parseEther('100'), ethers.parseEther('10'), 12n, 'USD', 'QmOld',
        [agent1.address]
      );

      await ethers.provider.send('evm_increaseTime', [15 * 24 * 60 * 60]);
      await ethers.provider.send('evm_mine', []);

      await market.createOffer(
        0, ethers.parseEther('200'), ethers.parseEther('20'), 5n, 'USD', 'QmNew',
        [agent1.address]
      );

      const agentOfferIds = await market.getOffersByAgent(agent1.address);
      expect(agentOfferIds).to.have.lengthOf(1);
      expect(agentOfferIds[0]).to.equal(2n);
    });

    it('isOfferExpired returns true for deleted offer', async function () {
      expect(await market.isOfferExpired(999n)).to.be.true;
    });
  });

  describe('expired-offer cleanup', function () {
    const TTL_PLUS_ONE_DAY = 15 * 24 * 60 * 60;

    async function expireBlockTime() {
      await ethers.provider.send('evm_increaseTime', [TTL_PLUS_ONE_DAY]);
      await ethers.provider.send('evm_mine', []);
    }

    describe('pruneExpiredOffer', function () {
      it('deletes an expired offer and emits OfferPruned', async function () {
        await market
          .connect(provider)
          .createOffer(0, ethers.parseEther('100'), ethers.parseEther('10'), 12n, 'USD', 'Qm', []);
        await expireBlockTime();

        await expect(market.connect(buyer).pruneExpiredOffer(1n))
          .to.emit(market, 'OfferPruned')
          .withArgs(1n, provider.address);

        await expect(market.getOffer(1n)).to.be.revertedWithCustomError(market, 'OfferNotFound');
      });

      it('reverts when offer does not exist', async function () {
        await expect(market.pruneExpiredOffer(999n)).to.be.revertedWithCustomError(market, 'OfferNotFound');
      });

      it('reverts when offer is still within TTL', async function () {
        await market
          .connect(provider)
          .createOffer(0, ethers.parseEther('100'), ethers.parseEther('10'), 12n, 'USD', 'Qm', []);

        await expect(market.pruneExpiredOffer(1n)).to.be.revertedWithCustomError(market, 'OfferNotExpired');
      });

      it('clears offer from userOffers and agentOffers reverse mappings', async function () {
        await market.connect(agent1).registerAgent('Agent A', 'QmA', 5n, 4n, 0n);
        await market
          .connect(provider)
          .createOffer(
            0,
            ethers.parseEther('100'),
            ethers.parseEther('10'),
            12n,
            'USD',
            'Qm',
            [agent1.address],
          );
        await expireBlockTime();

        await market.pruneExpiredOffer(1n);

        expect(await market.getUserOffers(provider.address)).to.have.lengthOf(0);
        expect(await market.getOffersByAgent(agent1.address)).to.have.lengthOf(0);
      });
    });

    describe('pruneExpiredOffers (batch)', function () {
      it('prunes all expired ids and silently skips fresh/missing ones', async function () {
        await market
          .connect(provider)
          .createOffer(0, ethers.parseEther('100'), ethers.parseEther('10'), 12n, 'USD', 'QmA', []);
        await market
          .connect(provider)
          .createOffer(0, ethers.parseEther('100'), ethers.parseEther('10'), 12n, 'USD', 'QmB', []);
        await expireBlockTime();

        // Create a fresh offer post-expiry (different signer to avoid auto-sweep aliasing).
        await market
          .connect(buyer)
          .createOffer(0, ethers.parseEther('100'), ethers.parseEther('10'), 12n, 'USD', 'QmFresh', []);

        await market.pruneExpiredOffers([1n, 2n, 3n, 999n]);

        await expect(market.getOffer(1n)).to.be.revertedWithCustomError(market, 'OfferNotFound');
        await expect(market.getOffer(2n)).to.be.revertedWithCustomError(market, 'OfferNotFound');
        const fresh = await market.getOffer(3n);
        expect(fresh.metadataCID).to.equal('QmFresh');
      });

      it('is a no-op for an empty list', async function () {
        await expect(market.pruneExpiredOffers([])).to.not.be.reverted;
      });
    });

    describe('getExpiredOfferIds', function () {
      it('returns ids past their TTL that still live in storage', async function () {
        await market
          .connect(provider)
          .createOffer(0, ethers.parseEther('100'), ethers.parseEther('10'), 12n, 'USD', 'QmA', []);
        await market
          .connect(provider)
          .createOffer(0, ethers.parseEther('100'), ethers.parseEther('10'), 12n, 'USD', 'QmB', []);
        await expireBlockTime();

        // Fresh offer from a different signer — not subject to provider's auto-sweep.
        await market
          .connect(buyer)
          .createOffer(0, ethers.parseEther('100'), ethers.parseEther('10'), 12n, 'USD', 'QmFresh', []);

        const expired = await market.getExpiredOfferIds();
        expect(expired.map((id: bigint) => Number(id)).sort()).to.deep.equal([1, 2]);
      });

      it('returns empty when no offers exist', async function () {
        const fresh = await (await ethers.getContractFactory('P2PMarket')).deploy();
        const expired = await fresh.getExpiredOfferIds();
        expect(expired).to.have.lengthOf(0);
      });
    });

    describe('createOffer auto-sweep', function () {
      it('cleans the caller\'s expired offers before the new one is recorded', async function () {
        await market
          .connect(provider)
          .createOffer(0, ethers.parseEther('100'), ethers.parseEther('10'), 12n, 'USD', 'QmOld', []);
        await expireBlockTime();

        // New offer by the same provider triggers the sweep.
        await expect(
          market
            .connect(provider)
            .createOffer(0, ethers.parseEther('200'), ethers.parseEther('20'), 5n, 'USD', 'QmNew', []),
        )
          .to.emit(market, 'OfferPruned')
          .withArgs(1n, provider.address);

        await expect(market.getOffer(1n)).to.be.revertedWithCustomError(market, 'OfferNotFound');
        expect(await market.getUserOffers(provider.address)).to.have.lengthOf(1);
      });

      it('does not touch a different user\'s expired offers', async function () {
        await market
          .connect(provider)
          .createOffer(0, ethers.parseEther('100'), ethers.parseEther('10'), 12n, 'USD', 'QmOld', []);
        await expireBlockTime();

        // Different user creates a fresh offer — provider's expired offer survives.
        await market
          .connect(buyer)
          .createOffer(0, ethers.parseEther('200'), ethers.parseEther('20'), 5n, 'USD', 'QmFresh', []);

        const stored = await market.getOffer(1n);
        expect(stored.metadataCID).to.equal('QmOld');
      });
    });

    describe('lockTrade — expired offer guard', function () {
      it('reverts when the linked offer has expired', async function () {
        await market.connect(agent1).registerAgent('Agent A', 'QmA', 5n, 4n, 0n);
        await market
          .connect(provider)
          .createOffer(
            0,
            ethers.parseEther('1000'),
            ethers.parseEther('10'),
            5n,
            'USD',
            'QmOffer',
            [agent1.address],
          );
        await expireBlockTime();

        await expect(
          market
            .connect(provider)
            .lockTrade(buyer.address, 1n, agent1.address, { value: ethers.parseEther('100') }),
        ).to.be.revertedWithCustomError(market, 'OfferExpiredError');
      });
    });
  });

  // ═══════════════════════════════════════════
  // ═══ VIEW FUNCTION TESTS ═══
  // ═══════════════════════════════════════════

  describe('view functions', function () {
    beforeEach(async function () {
      await market.createOffer(0, ethers.parseEther('100'), ethers.parseEther('10'), 12n, 'USD', 'QmTest', []);
    });

    it('getOffer should return offer data', async function () {
      const offer = await market.getOffer(1n);
      expect(offer.id).to.equal(1n);
      expect(offer.owner).to.equal(owner.address);
      expect(offer.fiatCurrency).to.equal('USD');
      expect(offer.pricePerToken).to.equal(100);
    });

    it('getOffer should revert for non-existent offer', async function () {
      await expect(market.getOffer(999n)).to.be.revertedWithCustomError(market, 'OfferNotFound');
    });

    it('getAllOffers should return all active offers in one call', async function () {
      await market.createOffer(0, ethers.parseEther('200'), ethers.parseEther('20'), 5n, 'USD', 'QmSecond', []);

      const allOffers = await market.getAllOffers();
      expect(allOffers).to.have.lengthOf(2);
      expect(allOffers[0].id).to.equal(1n);
      expect(allOffers[0].fiatCurrency).to.equal('USD');
      expect(allOffers[1].id).to.equal(2n);
      expect(allOffers[1].fiatCurrency).to.equal('USD');
    });

    it('getAllOffers should return empty array when no offers', async function () {
      const freshMarket = await (await ethers.getContractFactory('P2PMarket')).deploy();
      const allOffers = await freshMarket.getAllOffers();
      expect(allOffers).to.have.lengthOf(0);
    });
  });

  describe('tokenPricePerCurrency', function () {
    it('should have USD price set in constructor', async function () {
      expect(await market.tokenPricePerCurrency('USD')).to.equal(100);
    });

    it('should leave unsupported currencies at zero', async function () {
      expect(await market.tokenPricePerCurrency('EUR')).to.equal(0);
      expect(await market.tokenPricePerCurrency('GBP')).to.equal(0);
    });
  });

  // ═══════════════════════════════════════════
  // ═══ ESCROW / TRADE TESTS ═══
  // ═══════════════════════════════════════════

  describe('lockTrade', function () {
    it('should lock native tokens and emit TradeLocked', async function () {
      const amount = ethers.parseEther('10');
      await expect(
        market.connect(provider).lockTrade(buyer.address, 0, ethers.ZeroAddress, { value: amount })
      )
        .to.emit(market, 'TradeLocked')
        .withArgs(1n, provider.address, buyer.address, ethers.ZeroAddress, amount);
    });

    it('should store trade data correctly', async function () {
      const amount = ethers.parseEther('5');
      await market.connect(provider).lockTrade(buyer.address, 0, ethers.ZeroAddress, { value: amount });

      const trade = await market.getTrade(1n);
      expect(trade.id).to.equal(1n);
      expect(trade.locker).to.equal(provider.address);
      expect(trade.counterparty).to.equal(buyer.address);
      expect(trade.agent).to.equal(ethers.ZeroAddress);
      expect(trade.amount).to.equal(amount);
      expect(trade.state).to.equal(0); // LOCKED
      expect(trade.lockerConfirmed).to.be.false;
      expect(trade.counterpartyConfirmed).to.be.false;
      expect(trade.lockerCancelRequested).to.be.false;
      expect(trade.counterpartyCancelRequested).to.be.false;
      expect(trade.lockedAt).to.be.gt(0);
    });

    it('should hold funds in contract balance', async function () {
      const amount = ethers.parseEther('10');
      await market.connect(provider).lockTrade(buyer.address, 0, ethers.ZeroAddress, { value: amount });

      const balance = await ethers.provider.getBalance(await market.getAddress());
      expect(balance).to.equal(amount);
    });

    it('should allow either party to lock (buyer locks for provider)', async function () {
      const amount = ethers.parseEther('10');
      await expect(
        market.connect(buyer).lockTrade(provider.address, 0, ethers.ZeroAddress, { value: amount })
      )
        .to.emit(market, 'TradeLocked')
        .withArgs(1n, buyer.address, provider.address, ethers.ZeroAddress, amount);

      const trade = await market.getTrade(1n);
      expect(trade.locker).to.equal(buyer.address);
      expect(trade.counterparty).to.equal(provider.address);
    });

    it('should lock with agent', async function () {
      await market.connect(agent1).registerAgent('Agent A', 'QmA', 5n, 4n, 0n);
      const amount = ethers.parseEther('10');

      await expect(
        market.connect(provider).lockTrade(buyer.address, 0, agent1.address, { value: amount })
      )
        .to.emit(market, 'TradeLocked')
        .withArgs(1n, provider.address, buyer.address, agent1.address, amount);

      const trade = await market.getTrade(1n);
      expect(trade.agent).to.equal(agent1.address);
    });

    it('should add trade to userTrades for locker, counterparty, and agent', async function () {
      await market.connect(agent1).registerAgent('Agent A', 'QmA', 5n, 4n, 0n);
      await market.connect(provider).lockTrade(buyer.address, 0, agent1.address, { value: ethers.parseEther('1') });

      expect(await market.getUserTrades(provider.address)).to.deep.equal([1n]);
      expect(await market.getUserTrades(buyer.address)).to.deep.equal([1n]);
      expect(await market.getUserTrades(agent1.address)).to.deep.equal([1n]);
    });

    it('should increment tradeCounter', async function () {
      await market.connect(provider).lockTrade(buyer.address, 0, ethers.ZeroAddress, { value: ethers.parseEther('1') });
      await market.connect(provider).lockTrade(buyer.address, 0, ethers.ZeroAddress, { value: ethers.parseEther('2') });

      expect(await market.getTradeCount()).to.equal(2n);
    });

    it('should revert with zero value', async function () {
      await expect(
        market.connect(provider).lockTrade(buyer.address, 0, ethers.ZeroAddress, { value: 0 })
      ).to.be.revertedWithCustomError(market, 'InvalidAmount');
    });

    it('should revert with zero address counterparty', async function () {
      await expect(
        market.connect(provider).lockTrade(ethers.ZeroAddress, 0, ethers.ZeroAddress, { value: ethers.parseEther('1') })
      ).to.be.revertedWithCustomError(market, 'InvalidCounterparty');
    });

    it('should revert when counterparty is sender', async function () {
      await expect(
        market.connect(provider).lockTrade(provider.address, 0, ethers.ZeroAddress, { value: ethers.parseEther('1') })
      ).to.be.revertedWithCustomError(market, 'InvalidCounterparty');
    });

    it('should revert with unregistered agent', async function () {
      await expect(
        market.connect(provider).lockTrade(buyer.address, 0, agent1.address, { value: ethers.parseEther('1') })
      ).to.be.revertedWithCustomError(market, 'AgentNotRegistered');
    });

    it('should revert with deactivated agent', async function () {
      await market.connect(agent1).registerAgent('Agent A', 'QmA', 5n, 4n, 0n);
      await market.connect(agent1).deactivateAgent();

      await expect(
        market.connect(provider).lockTrade(buyer.address, 0, agent1.address, { value: ethers.parseEther('1') })
      ).to.be.revertedWithCustomError(market, 'AgentNotActive');
    });
  });

  describe('lockTrade — offer validation', function () {
    let offerId: bigint;

    beforeEach(async function () {
      await market.connect(agent1).registerAgent('Agent A', 'QmA', 5n, 4n, 0n);
      await market.connect(provider).createOffer(
        0, ethers.parseEther('1000'), ethers.parseEther('10'), 5n, 'USD', 'QmOffer',
        [agent1.address]
      );
      offerId = 1n;
    });

    it('should lock with valid offer and amount', async function () {
      await market.connect(provider).lockTrade(buyer.address, offerId, agent1.address, { value: ethers.parseEther('100') });
      const trade = await market.getTrade(1n);
      expect(trade.offerId).to.equal(offerId);
    });

    it('should revert when amount below offer minAmount', async function () {
      await expect(
        market.connect(provider).lockTrade(buyer.address, offerId, agent1.address, { value: ethers.parseEther('5') })
      ).to.be.revertedWithCustomError(market, 'InvalidAmount');
    });

    it('should revert when amount exceeds offer amountAvailable', async function () {
      await expect(
        market.connect(provider).lockTrade(buyer.address, offerId, agent1.address, { value: ethers.parseEther('1001') })
      ).to.be.revertedWithCustomError(market, 'InvalidAmount');
    });

    it('should revert with non-existent offerId', async function () {
      await expect(
        market.connect(provider).lockTrade(buyer.address, 999n, ethers.ZeroAddress, { value: ethers.parseEther('10') })
      ).to.be.revertedWithCustomError(market, 'OfferNotFound');
    });

    it('should skip validation for ad-hoc trade (offerId = 0)', async function () {
      // Any amount works when offerId is 0 — no min/max check
      await market.connect(provider).lockTrade(buyer.address, 0, ethers.ZeroAddress, { value: ethers.parseEther('1') });
      expect(await market.getTradeCount()).to.equal(1n);
    });
  });

  describe('confirmTrade — direct (no agent)', function () {
    beforeEach(async function () {
      await market.connect(provider).lockTrade(buyer.address, 0, ethers.ZeroAddress, { value: ethers.parseEther('10') });
    });

    it('should allow locker to confirm', async function () {
      await expect(market.connect(provider).confirmTrade(1n))
        .to.emit(market, 'TradeConfirmed')
        .withArgs(1n, provider.address);

      const trade = await market.getTrade(1n);
      expect(trade.lockerConfirmed).to.be.true;
      expect(trade.state).to.equal(0); // Still LOCKED
    });

    it('should allow counterparty to confirm', async function () {
      await expect(market.connect(buyer).confirmTrade(1n))
        .to.emit(market, 'TradeConfirmed')
        .withArgs(1n, buyer.address);

      const trade = await market.getTrade(1n);
      expect(trade.counterpartyConfirmed).to.be.true;
      expect(trade.state).to.equal(0); // Still LOCKED
    });

    it('should release funds when both confirm', async function () {
      await market.connect(provider).confirmTrade(1n);

      const buyerBalanceBefore = await ethers.provider.getBalance(buyer.address);
      const tx = await market.connect(buyer).confirmTrade(1n);
      const receipt = await tx.wait();
      const gasUsed = receipt!.gasUsed * receipt!.gasPrice;
      const buyerBalanceAfter = await ethers.provider.getBalance(buyer.address);

      // Counterparty received 10 ETH minus gas
      expect(buyerBalanceAfter - buyerBalanceBefore + gasUsed).to.equal(ethers.parseEther('10'));

      const trade = await market.getTrade(1n);
      expect(trade.state).to.equal(2); // COMPLETED
    });

    it('should emit TradeReleased when both confirm', async function () {
      await market.connect(provider).confirmTrade(1n);
      await expect(market.connect(buyer).confirmTrade(1n))
        .to.emit(market, 'TradeReleased')
        .withArgs(1n, buyer.address, ethers.parseEther('10'));
    });

    it('should release regardless of confirmation order', async function () {
      await market.connect(buyer).confirmTrade(1n);
      await expect(market.connect(provider).confirmTrade(1n))
        .to.emit(market, 'TradeReleased')
        .withArgs(1n, buyer.address, ethers.parseEther('10'));
    });

    it('should revert on double confirm', async function () {
      await market.connect(provider).confirmTrade(1n);
      await expect(
        market.connect(provider).confirmTrade(1n)
      ).to.be.revertedWithCustomError(market, 'AlreadyConfirmed');
    });

    it('should revert for non-participant', async function () {
      await expect(
        market.connect(agent1).confirmTrade(1n)
      ).to.be.revertedWithCustomError(market, 'NotTradeParticipant');
    });

    it('should revert for non-existent trade', async function () {
      await expect(
        market.connect(provider).confirmTrade(999n)
      ).to.be.revertedWithCustomError(market, 'TradeNotFound');
    });

    it('should revert after timeout', async function () {
      await ethers.provider.send('evm_increaseTime', [25 * 60 * 60]); // 25 hours
      await ethers.provider.send('evm_mine', []);

      await expect(
        market.connect(provider).confirmTrade(1n)
      ).to.be.revertedWithCustomError(market, 'TimeoutReached');
    });
  });

  describe('confirmTrade — rejects agent trades', function () {
    it('should revert when trade has an agent', async function () {
      await market.connect(agent1).registerAgent('Agent A', 'QmA', 5n, 4n, 0n);
      await market.connect(provider).lockTrade(buyer.address, 0, agent1.address, { value: ethers.parseEther('10') });

      await expect(
        market.connect(provider).confirmTrade(1n)
      ).to.be.revertedWithCustomError(market, 'OnlyDirectTrades');
    });
  });

  // ═══════════════════════════════════════════
  // ═══ AGENT TRADE FLOW TESTS ═══
  // ═══════════════════════════════════════════

  describe('confirmCashReceived', function () {
    beforeEach(async function () {
      await market.connect(agent1).registerAgent('Agent A', 'QmA', 5n, 4n, 0n, { value: ethers.parseEther('100') });
      await market.connect(provider).lockTrade(buyer.address, 0, agent1.address, { value: ethers.parseEther('10') });
    });

    it('should transfer tokens to buyer and set RELEASED', async function () {
      const buyerBefore = await ethers.provider.getBalance(buyer.address);
      await market.connect(agent1).confirmCashReceived(1n);
      const buyerAfter = await ethers.provider.getBalance(buyer.address);

      expect(buyerAfter - buyerBefore).to.equal(ethers.parseEther('10'));

      const trade = await market.getTrade(1n);
      expect(trade.state).to.equal(1); // RELEASED
    });

    it('should set pickupDeadline', async function () {
      await market.connect(agent1).confirmCashReceived(1n);

      const trade = await market.getTrade(1n);
      expect(trade.pickupDeadline).to.be.gt(0);
    });

    it('should emit CashReceived and TradeReleased', async function () {
      await expect(market.connect(agent1).confirmCashReceived(1n))
        .to.emit(market, 'CashReceived')
        .withArgs(1n, agent1.address)
        .and.to.emit(market, 'TradeReleased')
        .withArgs(1n, buyer.address, ethers.parseEther('10'));
    });

    it('should revert if caller is not the agent', async function () {
      await expect(
        market.connect(provider).confirmCashReceived(1n)
      ).to.be.revertedWithCustomError(market, 'NotAgent');
    });

    it('should revert for direct trades', async function () {
      await market.connect(provider).lockTrade(buyer.address, 0, ethers.ZeroAddress, { value: ethers.parseEther('5') });
      await expect(
        market.connect(agent1).confirmCashReceived(2n)
      ).to.be.revertedWithCustomError(market, 'OnlyAgentTrades');
    });

    it('should revert if not LOCKED', async function () {
      await market.connect(agent1).confirmCashReceived(1n);
      await expect(
        market.connect(agent1).confirmCashReceived(1n)
      ).to.be.revertedWithCustomError(market, 'TradeNotLocked');
    });

    it('should revert after confirmation timeout', async function () {
      await ethers.provider.send('evm_increaseTime', [25 * 60 * 60]);
      await ethers.provider.send('evm_mine', []);

      await expect(
        market.connect(agent1).confirmCashReceived(1n)
      ).to.be.revertedWithCustomError(market, 'TimeoutReached');
    });
  });

  describe('confirmPickup', function () {
    beforeEach(async function () {
      await market.connect(agent1).registerAgent('Agent A', 'QmA', 5n, 4n, 0n, { value: ethers.parseEther('100') });
      await market.connect(provider).lockTrade(buyer.address, 0, agent1.address, { value: ethers.parseEther('10') });
      await market.connect(agent1).confirmCashReceived(1n);
    });

    it('should set COMPLETED', async function () {
      await market.connect(provider).confirmPickup(1n);

      const trade = await market.getTrade(1n);
      expect(trade.state).to.equal(2); // COMPLETED
    });

    it('should emit PickupConfirmed and TradeCompleted', async function () {
      await expect(market.connect(provider).confirmPickup(1n))
        .to.emit(market, 'PickupConfirmed')
        .withArgs(1n, provider.address)
        .and.to.emit(market, 'TradeCompleted')
        .withArgs(1n);
    });

    it('should revert if caller is not the locker', async function () {
      await expect(
        market.connect(buyer).confirmPickup(1n)
      ).to.be.revertedWithCustomError(market, 'NotLocker');
    });

    it('should revert if not RELEASED', async function () {
      await market.connect(provider).lockTrade(buyer.address, 0, agent1.address, { value: ethers.parseEther('5') });
      await expect(
        market.connect(provider).confirmPickup(2n)
      ).to.be.revertedWithCustomError(market, 'TradeNotReleased');
    });

    it('should revert for direct trades', async function () {
      await market.connect(provider).lockTrade(buyer.address, 0, ethers.ZeroAddress, { value: ethers.parseEther('5') });
      await market.connect(provider).confirmTrade(2n);
      await market.connect(buyer).confirmTrade(2n);
      await expect(
        market.connect(provider).confirmPickup(2n)
      ).to.be.revertedWithCustomError(market, 'OnlyAgentTrades');
    });
  });

  describe('offer amount reduction', function () {
    beforeEach(async function () {
      await market.connect(agent1).registerAgent('Agent A', 'QmA', 5n, 4n, 0n);
      await market.connect(provider).createOffer(
        0, ethers.parseEther('1000'), ethers.parseEther('10'), 5n, 'USD', 'QmOffer',
        [agent1.address]
      );
    });

    it('should reduce amountAvailable on confirmCashReceived (agent trade)', async function () {
      await market.connect(provider).lockTrade(buyer.address, 1n, agent1.address, { value: ethers.parseEther('400') });
      await market.connect(agent1).confirmCashReceived(1n);

      const offer = await market.getOffer(1n);
      expect(offer.amountAvailable).to.equal(ethers.parseEther('600'));
    });

    it('should reduce amountAvailable on confirmTrade (direct trade)', async function () {
      await market.connect(provider).lockTrade(buyer.address, 1n, ethers.ZeroAddress, { value: ethers.parseEther('300') });
      await market.connect(provider).confirmTrade(1n);
      await market.connect(buyer).confirmTrade(1n);

      const offer = await market.getOffer(1n);
      expect(offer.amountAvailable).to.equal(ethers.parseEther('700'));
    });

    it('should set amountAvailable to 0 when trade equals remaining', async function () {
      await market.connect(provider).lockTrade(buyer.address, 1n, agent1.address, { value: ethers.parseEther('1000') });
      await market.connect(agent1).confirmCashReceived(1n);

      const offer = await market.getOffer(1n);
      expect(offer.amountAvailable).to.equal(0n);
    });

    it('should reduce across multiple trades', async function () {
      await market.connect(provider).lockTrade(buyer.address, 1n, agent1.address, { value: ethers.parseEther('300') });
      await market.connect(agent1).confirmCashReceived(1n);

      await market.connect(provider).lockTrade(buyer.address, 1n, agent1.address, { value: ethers.parseEther('500') });
      await market.connect(agent1).confirmCashReceived(2n);

      const offer = await market.getOffer(1n);
      expect(offer.amountAvailable).to.equal(ethers.parseEther('200'));
    });

    it('should not allow locking more than remaining amountAvailable', async function () {
      await market.connect(provider).lockTrade(buyer.address, 1n, agent1.address, { value: ethers.parseEther('900') });
      await market.connect(agent1).confirmCashReceived(1n);

      await expect(
        market.connect(provider).lockTrade(buyer.address, 1n, agent1.address, { value: ethers.parseEther('200') })
      ).to.be.revertedWithCustomError(market, 'InvalidAmount');
    });

    it('should not affect offer when trade is ad-hoc (offerId = 0)', async function () {
      await market.connect(provider).lockTrade(buyer.address, 0, ethers.ZeroAddress, { value: ethers.parseEther('500') });
      await market.connect(provider).confirmTrade(1n);
      await market.connect(buyer).confirmTrade(1n);

      const offer = await market.getOffer(1n);
      expect(offer.amountAvailable).to.equal(ethers.parseEther('1000'));
    });
  });

  describe('requestCancel', function () {
    beforeEach(async function () {
      await market.connect(provider).lockTrade(buyer.address, 0, ethers.ZeroAddress, { value: ethers.parseEther('10') });
    });

    it('should allow locker to request cancel', async function () {
      await expect(market.connect(provider).requestCancel(1n))
        .to.emit(market, 'TradeCancelRequested')
        .withArgs(1n, provider.address);

      const trade = await market.getTrade(1n);
      expect(trade.lockerCancelRequested).to.be.true;
      expect(trade.state).to.equal(0); // Still LOCKED — need both
    });

    it('should allow counterparty to request cancel', async function () {
      await expect(market.connect(buyer).requestCancel(1n))
        .to.emit(market, 'TradeCancelRequested')
        .withArgs(1n, buyer.address);

      const trade = await market.getTrade(1n);
      expect(trade.counterpartyCancelRequested).to.be.true;
      expect(trade.state).to.equal(0); // Still LOCKED
    });

    it('should cancel and refund locker when both request', async function () {
      await market.connect(provider).requestCancel(1n);

      await expect(market.connect(buyer).requestCancel(1n))
        .to.emit(market, 'TradeCancelled')
        .withArgs(1n, provider.address, ethers.parseEther('10'));

      const trade = await market.getTrade(1n);
      expect(trade.state).to.equal(4); // CANCELLED
    });

    it('should cancel regardless of request order', async function () {
      await market.connect(buyer).requestCancel(1n);
      await expect(market.connect(provider).requestCancel(1n))
        .to.emit(market, 'TradeCancelled')
        .withArgs(1n, provider.address, ethers.parseEther('10'));
    });

    it('should revert on double cancel request', async function () {
      await market.connect(provider).requestCancel(1n);
      await expect(
        market.connect(provider).requestCancel(1n)
      ).to.be.revertedWithCustomError(market, 'AlreadyCancelRequested');
    });

    it('should revert for non-participant', async function () {
      await expect(
        market.connect(agent1).requestCancel(1n)
      ).to.be.revertedWithCustomError(market, 'NotTradeParticipant');
    });

    it('should revert for non-existent trade', async function () {
      await expect(
        market.connect(provider).requestCancel(999n)
      ).to.be.revertedWithCustomError(market, 'TradeNotFound');
    });

    it('should revert on already released trade', async function () {
      await market.connect(provider).confirmTrade(1n);
      await market.connect(buyer).confirmTrade(1n);

      await expect(
        market.connect(provider).requestCancel(1n)
      ).to.be.revertedWithCustomError(market, 'TradeNotLocked');
    });
  });

  describe('refundTrade', function () {
    beforeEach(async function () {
      await market.connect(provider).lockTrade(buyer.address, 0, ethers.ZeroAddress, { value: ethers.parseEther('10') });
    });

    it('should revert before timeout', async function () {
      await expect(
        market.connect(provider).refundTrade(1n)
      ).to.be.revertedWithCustomError(market, 'TimeoutNotReached');
    });

    it('should refund locker after timeout', async function () {
      await ethers.provider.send('evm_increaseTime', [25 * 60 * 60]); // 25 hours
      await ethers.provider.send('evm_mine', []);

      const providerBalanceBefore = await ethers.provider.getBalance(provider.address);
      const tx = await market.connect(provider).refundTrade(1n);
      const receipt = await tx.wait();
      const gasUsed = receipt!.gasUsed * receipt!.gasPrice;
      const providerBalanceAfter = await ethers.provider.getBalance(provider.address);

      expect(providerBalanceAfter - providerBalanceBefore + gasUsed).to.equal(ethers.parseEther('10'));

      const trade = await market.getTrade(1n);
      expect(trade.state).to.equal(3); // REFUNDED
    });

    it('should emit TradeRefunded', async function () {
      await ethers.provider.send('evm_increaseTime', [25 * 60 * 60]);
      await ethers.provider.send('evm_mine', []);

      await expect(market.connect(provider).refundTrade(1n))
        .to.emit(market, 'TradeRefunded')
        .withArgs(1n, provider.address, ethers.parseEther('10'));
    });

    it('should allow anyone to trigger refund after timeout', async function () {
      await ethers.provider.send('evm_increaseTime', [25 * 60 * 60]);
      await ethers.provider.send('evm_mine', []);

      await expect(market.connect(buyer).refundTrade(1n))
        .to.emit(market, 'TradeRefunded')
        .withArgs(1n, provider.address, ethers.parseEther('10'));
    });

    it('should revert on already released trade', async function () {
      await market.connect(provider).confirmTrade(1n);
      await market.connect(buyer).confirmTrade(1n);

      await ethers.provider.send('evm_increaseTime', [25 * 60 * 60]);
      await ethers.provider.send('evm_mine', []);

      await expect(
        market.connect(provider).refundTrade(1n)
      ).to.be.revertedWithCustomError(market, 'TradeNotLocked');
    });

    it('should revert on already refunded trade', async function () {
      await ethers.provider.send('evm_increaseTime', [25 * 60 * 60]);
      await ethers.provider.send('evm_mine', []);

      await market.connect(provider).refundTrade(1n);

      await expect(
        market.connect(provider).refundTrade(1n)
      ).to.be.revertedWithCustomError(market, 'TradeNotLocked');
    });

    it('should revert on cancelled trade', async function () {
      await market.connect(provider).requestCancel(1n);
      await market.connect(buyer).requestCancel(1n);

      await expect(
        market.connect(provider).refundTrade(1n)
      ).to.be.revertedWithCustomError(market, 'TradeNotLocked');
    });

    it('should revert for non-existent trade', async function () {
      await expect(
        market.connect(provider).refundTrade(999n)
      ).to.be.revertedWithCustomError(market, 'TradeNotFound');
    });
  });

  describe('confirmTrade — after completion', function () {
    it('should revert confirm on completed trade', async function () {
      await market.connect(provider).lockTrade(buyer.address, 0, ethers.ZeroAddress, { value: ethers.parseEther('10') });
      await market.connect(provider).confirmTrade(1n);
      await market.connect(buyer).confirmTrade(1n);

      await expect(
        market.connect(provider).confirmTrade(1n)
      ).to.be.revertedWithCustomError(market, 'TradeNotLocked');
    });
  });

  describe('trade view functions', function () {
    it('getTrade should revert for non-existent trade', async function () {
      await expect(market.getTrade(999n))
        .to.be.revertedWithCustomError(market, 'TradeNotFound');
    });

    it('getTradeCount should return correct count', async function () {
      expect(await market.getTradeCount()).to.equal(0n);

      await market.connect(provider).lockTrade(buyer.address, 0, ethers.ZeroAddress, { value: ethers.parseEther('1') });
      expect(await market.getTradeCount()).to.equal(1n);
    });

    it('getUserTrades should return empty for new user', async function () {
      expect(await market.getUserTrades(buyer.address)).to.deep.equal([]);
    });
  });

  // ═══════════════════════════════════════════
  // ═══ AGENT ACTIVE TRADE GUARDS ═══
  // ═══════════════════════════════════════════

  describe('agent active trade guards', function () {
    beforeEach(async function () {
      await market.connect(agent1).registerAgent('Agent A', 'QmA', 5n, 4n, 0n, { value: ethers.parseEther('50') });
    });

    it('removeAgent should revert with LOCKED trade', async function () {
      await market.connect(provider).lockTrade(buyer.address, 0, agent1.address, { value: ethers.parseEther('10') });

      await expect(
        market.connect(agent1).removeAgent()
      ).to.be.revertedWithCustomError(market, 'AgentHasActiveTrades');
    });

    it('removeAgent should revert with RELEASED trade', async function () {
      await market.connect(provider).lockTrade(buyer.address, 0, agent1.address, { value: ethers.parseEther('10') });
      await market.connect(agent1).confirmCashReceived(1n);

      await expect(
        market.connect(agent1).removeAgent()
      ).to.be.revertedWithCustomError(market, 'AgentHasActiveTrades');
    });

    it('removeAgent should succeed after trade is COMPLETED', async function () {
      await market.connect(provider).lockTrade(buyer.address, 0, agent1.address, { value: ethers.parseEther('10') });
      await market.connect(agent1).confirmCashReceived(1n);
      await market.connect(provider).confirmPickup(1n);

      await expect(market.connect(agent1).removeAgent())
        .to.emit(market, 'AgentRemoved');
    });

    it('unstakeInsurance should revert with LOCKED trade', async function () {
      await market.connect(provider).lockTrade(buyer.address, 0, agent1.address, { value: ethers.parseEther('10') });

      await expect(
        market.connect(agent1).unstakeInsurance(ethers.parseEther('1'))
      ).to.be.revertedWithCustomError(market, 'AgentHasActiveTrades');
    });

    it('unstakeInsurance should succeed after trade is COMPLETED', async function () {
      await market.connect(provider).lockTrade(buyer.address, 0, agent1.address, { value: ethers.parseEther('10') });
      await market.connect(agent1).confirmCashReceived(1n);
      await market.connect(provider).confirmPickup(1n);

      await market.connect(agent1).unstakeInsurance(ethers.parseEther('10'));
      const agent = await market.getAgent(agent1.address);
      expect(agent.stakedAmount).to.equal(ethers.parseEther('40'));
    });
  });

  // ═══════════════════════════════════════════
  // ═══ FULL INTEGRATION SCENARIOS ═══
  // ═══════════════════════════════════════════

  describe('integration — agent trade happy path', function () {
    it('lock → confirmCashReceived → confirmPickup → COMPLETED', async function () {
      await market.connect(agent1).registerAgent('Agent A', 'QmA', 5n, 4n, 0n, { value: ethers.parseEther('100') });

      // Provider locks
      await market.connect(provider).lockTrade(buyer.address, 0, agent1.address, { value: ethers.parseEther('10') });
      let trade = await market.getTrade(1n);
      expect(trade.state).to.equal(0); // LOCKED

      // Agent confirms cash from buyer
      await market.connect(agent1).confirmCashReceived(1n);
      trade = await market.getTrade(1n);
      expect(trade.state).to.equal(1); // RELEASED

      // Provider confirms pickup
      await market.connect(provider).confirmPickup(1n);
      trade = await market.getTrade(1n);
      expect(trade.state).to.equal(2); // COMPLETED
    });
  });


  describe('integration — direct trade happy path', function () {
    it('lock → both confirm → COMPLETED', async function () {
      await market.connect(provider).lockTrade(buyer.address, 0, ethers.ZeroAddress, { value: ethers.parseEther('10') });

      await market.connect(provider).confirmTrade(1n);
      await market.connect(buyer).confirmTrade(1n);

      const trade = await market.getTrade(1n);
      expect(trade.state).to.equal(2); // COMPLETED
    });
  });
});