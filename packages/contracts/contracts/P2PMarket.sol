// SPDX-License-Identifier: GPL-3.0-only
pragma solidity ^0.8.28;

/**
 * @title P2PMarket
 * @notice P2P marketplace with handoff agents and native-token escrow
 * @dev Agents register as physical locations. Providers create offers and choose
 *      which agents to work with. Users browse agents/offers and trade in person.
 *      Escrow: either party locks native tokens (PAS), all parties confirm,
 *      funds release to counterparty. 24h timeout → refund to locker.
 */
contract P2PMarket {
    /// @notice SELL = provider has tokens, BUY = buyer has cash. Same offer fields for both.
    enum OfferType {
        SELL,
        BUY
    }

    /// @notice Trade lifecycle states
    enum TradeState {
        LOCKED,     // 0 - Funds locked in escrow
        RELEASED,   // 1 - Tokens released to buyer, awaiting provider pickup (agent trades only)
        COMPLETED,  // 2 - Trade fully done (both direct and agent)
        REFUNDED,   // 3 - Funds refunded to locker (timeout)
        CANCELLED   // 4 - Funds returned to locker (mutual cancel)
    }

    string public constant VERSION = "7.1.0";

    /// @notice Max flat fee in whole currency units (e.g. 1000 = 1000 USD)
    uint256 public constant MAX_FLAT_FEE = 1000;

    /// @notice Offer TTL — offers older than this are considered expired (14 days)
    uint256 public constant OFFER_TTL = 14 days;

    /// @notice Escrow timeout — 24h after lock, locker can reclaim funds
    uint256 public constant CONFIRMATION_TIMEOUT = 24 hours;

    /// @notice Min/max hold hours an agent can choose for holding cash post-handover.
    /// @dev Agent self-declares this on register/update. Hours past this are paid in cash off-chain.
    uint8 public constant MIN_HOLD_HOURS = 2;
    uint8 public constant MAX_HOLD_HOURS = 72;

    // ═══ ERRORS ═══

    // Offer/Agent errors
    error InvalidAmount();
    error InvalidMinAmount();
    error InvalidCurrency();
    error InvalidMetadataCID();
    error FlatFeeTooHigh();
    error CurrencyNotSupported();
    error OfferNotFound();
    error OfferExpiredError();
    error OfferNotExpired();
    error NotOfferOwner();
    error AgentAlreadyOnOffer();
    error AgentAlreadyRegistered();
    error AgentNotRegistered();
    error InvalidName();
    error AgentNotActive();
    error AgentAlreadyActive();
    error InsufficientInsurance();
    error NoInsuranceToWithdraw();
    error InvalidHoldHours();

    // Trade/Escrow errors
    error InvalidCounterparty();
    error TradeNotFound();
    error TradeNotLocked();
    error TradeNotReleased();
    error NotTradeParticipant();
    error NotLocker();
    error NotAgent();
    error AlreadyConfirmed();
    error AlreadyCancelRequested();
    error TimeoutNotReached();
    error TimeoutReached();
    error OnlyDirectTrades();
    error OnlyAgentTrades();
    error AgentHasActiveTrades();
    error TransferFailed();
    error ReentrancyGuard();
    error InvalidEvidenceCID();

    // ═══ AGENT EVENTS ═══
    event AgentRegistered(
        address indexed agent,
        string name,
        uint256 flatFee,
        string metadataCID,
        uint8 holdHours,
        uint256 extraHourFee
    );

    event AgentUpdated(
        address indexed agent,
        string name,
        uint256 flatFee,
        string metadataCID,
        uint8 holdHours,
        uint256 extraHourFee
    );

    event AgentDeactivated(address indexed agent);
    event AgentRemoved(address indexed agent);
    event InsuranceStaked(address indexed agent, uint256 amount, uint256 totalStaked);
    event InsuranceUnstaked(address indexed agent, uint256 amount, uint256 totalStaked);

    // ═══ OFFER EVENTS ═══
    event OfferCreated(
        uint256 indexed offerId,
        address indexed owner,
        OfferType offerType,
        uint256 amountAvailable,
        uint256 minAmount,
        uint256 pricePerToken,
        string fiatCurrency,
        uint256 flatFee,
        string metadataCID
    );
    event OfferRemoved(uint256 indexed offerId, address indexed owner);
    event OfferPruned(uint256 indexed offerId, address indexed owner);
    event OfferAgentAdded(uint256 indexed offerId, address indexed agent);

    // ═══ TRADE/ESCROW EVENTS ═══
    event TradeLocked(
        uint256 indexed tradeId,
        address indexed locker,
        address indexed counterparty,
        address agent,
        uint256 amount
    );
    event TradeConfirmed(uint256 indexed tradeId, address indexed confirmer);
    event TradeReleased(uint256 indexed tradeId, address indexed counterparty, uint256 amount);
    event TradeRefunded(uint256 indexed tradeId, address indexed locker, uint256 amount);
    event TradeCancelRequested(uint256 indexed tradeId, address indexed requester);
    event TradeCancelled(uint256 indexed tradeId, address indexed locker, uint256 amount);
    event CashReceived(uint256 indexed tradeId, address indexed agent);
    event TradeCompleted(uint256 indexed tradeId);
    event PickupConfirmed(uint256 indexed tradeId, address indexed provider);
    event EvidenceAttached(uint256 indexed tradeId, address indexed setter, string cid);

    // ═══ AGENT STORAGE ═══
    struct Agent {
        address wallet;
        string name;
        string metadataCID;     // Bulletin CID → JSON with location, working hours
        uint256 flatFee;        // Informational only — paid in cash at location
        bool active;
        uint256 registeredAt;
        uint256 stakedAmount;   // Insurance stake (PAS) — reserved for dispute resolution
        uint8 holdHours;        // Hours agent will hold cash before late fees apply (>= MIN_HOLD_HOURS)
        uint256 extraHourFee;   // Flat fee per extra hour over holdHours (cash, off-chain)
    }

    mapping(address => Agent) public agents;
    address[] public agentList;
    mapping(address => uint256) internal agentIndex; // 1-based index for O(1) removal

    // ═══ OFFER STORAGE ═══
    struct Offer {
        uint256 id;
        address owner;
        OfferType offerType;
        uint256 amountAvailable;     // Token amount (SELL: to sell, BUY: to buy)
        uint256 minAmount;          // Min trade amount in token units
        uint256 pricePerToken;      // Fiat cents per 1 token (from contract)
        string fiatCurrency;        // "USD" — cash currency for this offer (V1: USD only)
        uint256 flatFee;            // Flat fee in whole currency units (offer creator sets)
        bool active;
        string metadataCID;         // Bulletin CID → location + availability
        uint256 createdAt;
        address[] agentAddresses;   // Agents where this offer is available
    }

    uint256 public offerCounter;
    mapping(uint256 => Offer) public offers;
    mapping(address => uint256[]) public userOffers;
    mapping(address => uint256[]) public agentOffers; // reverse: agent → offerIds

    /// @dev Price per token in cents (e.g. 100 = 1.00 USD). V1 supports USD only.
    mapping(string => uint256) public tokenPricePerCurrency;

    // ═══ TRADE/ESCROW STORAGE ═══
    struct Trade {
        uint256 id;
        uint256 offerId;                // Link to offer (0 for ad-hoc trades)
        address locker;                 // Deposited native tokens (provider)
        address counterparty;           // Receives tokens after confirmation (buyer)
        address agent;                  // Agent middleman (address(0) for direct)
        uint256 amount;                 // Locked native token amount
        TradeState state;
        bool lockerConfirmed;           // Used for direct 2-way trades only
        bool counterpartyConfirmed;     // Used for direct 2-way trades only
        bool lockerCancelRequested;
        bool counterpartyCancelRequested;
        uint256 lockedAt;               // Timestamp when funds were locked
        uint256 pickupDeadline;         // Provider pickup deadline (set on RELEASED, lockedAt + agent.holdHours * 1h)
        string evidenceCID;             // Bulletin CID for handoff video (set by either trade party)
    }

    uint256 public tradeCounter;
    mapping(uint256 => Trade) public trades;
    mapping(address => uint256[]) public userTrades;

    /// @dev Simple reentrancy guard
    bool private _locked;
    modifier noReentrant() {
        if (_locked) revert ReentrancyGuard();
        _locked = true;
        _;
        _locked = false;
    }

    constructor() {
        tokenPricePerCurrency["USD"] = 100;  // 1 token = 1.00 USD
    }

    // ═══════════════════════════════════════════
    // ═══ AGENT FUNCTIONS ═══
    // ═══════════════════════════════════════════

    /// @notice Register as a handoff agent (physical exchange location)
    /// @param name Display name of the agency
    /// @param metadataCID Bulletin CID → JSON with location, working hours
    /// @param flatFee Flat fee in whole currency units (paid in cash, informational only)
    /// @param holdHours How long agent holds cash before extra-hour fees kick in (MIN_HOLD_HOURS..MAX_HOLD_HOURS)
    /// @param extraHourFee Flat per-hour fee for hours beyond holdHours (paid in cash, informational only)
    /// @dev Send native tokens (msg.value) to stake as insurance. Optional — 0 is valid.
    function registerAgent(
        string calldata name,
        string calldata metadataCID,
        uint256 flatFee,
        uint8 holdHours,
        uint256 extraHourFee
    ) external payable {
        if (agents[msg.sender].wallet != address(0)) revert AgentAlreadyRegistered();
        if (bytes(name).length == 0) revert InvalidName();
        if (bytes(metadataCID).length == 0) revert InvalidMetadataCID();
        if (flatFee > MAX_FLAT_FEE) revert FlatFeeTooHigh();
        if (holdHours < MIN_HOLD_HOURS || holdHours > MAX_HOLD_HOURS) revert InvalidHoldHours();
        if (extraHourFee > MAX_FLAT_FEE) revert FlatFeeTooHigh();

        agents[msg.sender] = Agent({
            wallet: msg.sender,
            name: name,
            metadataCID: metadataCID,
            flatFee: flatFee,
            active: true,
            registeredAt: block.timestamp,
            stakedAmount: msg.value,
            holdHours: holdHours,
            extraHourFee: extraHourFee
        });

        agentList.push(msg.sender);
        agentIndex[msg.sender] = agentList.length; // 1-based

        emit AgentRegistered(msg.sender, name, flatFee, metadataCID, holdHours, extraHourFee);
        if (msg.value > 0) {
            emit InsuranceStaked(msg.sender, msg.value, msg.value);
        }
    }

    /// @notice Update agent info (only the agent themselves)
    function updateAgent(
        string calldata name,
        string calldata metadataCID,
        uint256 flatFee,
        uint8 holdHours,
        uint256 extraHourFee
    ) external {
        if (agents[msg.sender].wallet == address(0)) revert AgentNotRegistered();
        if (bytes(name).length == 0) revert InvalidName();
        if (bytes(metadataCID).length == 0) revert InvalidMetadataCID();
        if (flatFee > MAX_FLAT_FEE) revert FlatFeeTooHigh();
        if (holdHours < MIN_HOLD_HOURS || holdHours > MAX_HOLD_HOURS) revert InvalidHoldHours();
        if (extraHourFee > MAX_FLAT_FEE) revert FlatFeeTooHigh();

        Agent storage agent = agents[msg.sender];
        agent.name = name;
        agent.metadataCID = metadataCID;
        agent.flatFee = flatFee;
        agent.holdHours = holdHours;
        agent.extraHourFee = extraHourFee;

        emit AgentUpdated(msg.sender, name, flatFee, metadataCID, holdHours, extraHourFee);
    }

    /// @notice Deactivate agent (removes from active list, offer links preserved)
    function deactivateAgent() external {
        if (agents[msg.sender].wallet == address(0)) revert AgentNotRegistered();
        if (!agents[msg.sender].active) revert AgentNotActive();

        agents[msg.sender].active = false;

        // Swap-and-pop removal from agentList
        uint256 idx = agentIndex[msg.sender] - 1; // convert to 0-based
        uint256 lastIdx = agentList.length - 1;
        if (idx != lastIdx) {
            address lastAgent = agentList[lastIdx];
            agentList[idx] = lastAgent;
            agentIndex[lastAgent] = idx + 1; // 1-based
        }
        agentList.pop();
        delete agentIndex[msg.sender];

        emit AgentDeactivated(msg.sender);
    }

    /// @notice Reactivate a previously deactivated agent
    function reactivateAgent() external {
        if (agents[msg.sender].wallet == address(0)) revert AgentNotRegistered();
        if (agents[msg.sender].active) revert AgentAlreadyActive();

        agents[msg.sender].active = true;

        agentList.push(msg.sender);
        agentIndex[msg.sender] = agentList.length; // 1-based

        Agent storage a = agents[msg.sender];
        emit AgentRegistered(
            msg.sender,
            a.name,
            a.flatFee,
            a.metadataCID,
            a.holdHours,
            a.extraHourFee
        );
    }

    /// @notice Add insurance stake to your agent deposit
    function stakeInsurance() external payable {
        if (agents[msg.sender].wallet == address(0)) revert AgentNotRegistered();
        if (msg.value == 0) revert InvalidAmount();
        agents[msg.sender].stakedAmount += msg.value;
        emit InsuranceStaked(msg.sender, msg.value, agents[msg.sender].stakedAmount);
    }

    /// @notice Withdraw insurance stake (blocked if agent has active trades)
    /// @param amount Amount of native tokens to withdraw
    function unstakeInsurance(uint256 amount) external noReentrant {
        if (agents[msg.sender].wallet == address(0)) revert AgentNotRegistered();
        _requireNoActiveTrades(msg.sender);
        if (agents[msg.sender].stakedAmount == 0) revert NoInsuranceToWithdraw();
        if (amount > agents[msg.sender].stakedAmount) revert InsufficientInsurance();
        agents[msg.sender].stakedAmount -= amount;
        (bool success, ) = payable(msg.sender).call{value: amount}("");
        if (!success) revert TransferFailed();
        emit InsuranceUnstaked(msg.sender, amount, agents[msg.sender].stakedAmount);
    }

    /// @notice Permanently remove agent — cleans all offer links, refunds stake
    /// @dev Blocked if agent has active trades (LOCKED or RELEASED)
    function removeAgent() external noReentrant {
        if (agents[msg.sender].wallet == address(0)) revert AgentNotRegistered();
        _requireNoActiveTrades(msg.sender);

        // If still in active list, remove from agentList
        if (agents[msg.sender].active) {
            uint256 idx = agentIndex[msg.sender] - 1;
            uint256 lastIdx = agentList.length - 1;
            if (idx != lastIdx) {
                address lastAgent = agentList[lastIdx];
                agentList[idx] = lastAgent;
                agentIndex[lastAgent] = idx + 1;
            }
            agentList.pop();
            delete agentIndex[msg.sender];
        }

        // Remove agent from every linked offer's agentAddresses[]
        uint256[] storage linkedOffers = agentOffers[msg.sender];
        for (uint256 i = 0; i < linkedOffers.length; i++) {
            uint256 oid = linkedOffers[i];
            if (offers[oid].id != 0) {
                _removeFromAddressArray(offers[oid].agentAddresses, msg.sender);
            }
        }
        delete agentOffers[msg.sender];

        // Refund staked insurance before deletion (CEI: clear before transfer)
        uint256 refund = agents[msg.sender].stakedAmount;
        agents[msg.sender].stakedAmount = 0;

        // Hard delete agent
        delete agents[msg.sender];

        // Transfer refund after state cleanup
        if (refund > 0) {
            (bool success, ) = payable(msg.sender).call{value: refund}("");
            if (!success) revert TransferFailed();
        }

        emit AgentRemoved(msg.sender);
    }

    /// @notice Get a single agent by address
    function getAgent(address wallet) external view returns (Agent memory) {
        if (agents[wallet].wallet == address(0)) revert AgentNotRegistered();
        return agents[wallet];
    }

    /// @notice Get all active agents
    function getAllAgents() external view returns (Agent[] memory) {
        uint256 count = agentList.length;
        Agent[] memory result = new Agent[](count);
        for (uint256 i = 0; i < count; i++) {
            result[i] = agents[agentList[i]];
        }
        return result;
    }

    /// @notice Get count of active agents
    function getAgentCount() external view returns (uint256) {
        return agentList.length;
    }

    // ═══════════════════════════════════════════
    // ═══ OFFER FUNCTIONS ═══
    // ═══════════════════════════════════════════

    /**
     * @notice Create offer (SELL or BUY) linked to specific agents.
     * @param offerType 0 = SELL (provider has tokens), 1 = BUY (buyer has cash)
     * @param amountAvailable Token amount (to sell or to buy)
     * @param minAmount Min trade amount in token units
     * @param flatFee Flat fee in whole currency units (e.g. 12 = 12 USD)
     * @param fiatCurrency Currency code (V1: "USD" only)
     * @param metadataCID Bulletin CID → JSON with location + availability data
     * @param agentAddrs Agents where this offer is available (can be empty for direct P2P)
     */
    function createOffer(
        OfferType offerType,
        uint256 amountAvailable,
        uint256 minAmount,
        uint256 flatFee,
        string calldata fiatCurrency,
        string calldata metadataCID,
        address[] calldata agentAddrs
    ) external returns (uint256) {
        // Opportunistic cleanup: drop caller's offers whose Bulletin CID has
        // already expired. Keeps userOffers[] from growing unbounded and
        // ensures the on-chain set tracks the Bulletin TTL.
        _sweepUserExpiredOffers(msg.sender);

        if (amountAvailable == 0) revert InvalidAmount();
        if (minAmount == 0) revert InvalidMinAmount();
        if (minAmount > amountAvailable) revert InvalidAmount();
        if (bytes(fiatCurrency).length == 0 || bytes(fiatCurrency).length > 10) revert InvalidCurrency();
        if (bytes(metadataCID).length == 0) revert InvalidMetadataCID();
        if (flatFee > MAX_FLAT_FEE) revert FlatFeeTooHigh();

        // Validate all agents are registered and active
        for (uint256 i = 0; i < agentAddrs.length; i++) {
            if (agents[agentAddrs[i]].wallet == address(0)) revert AgentNotRegistered();
            if (!agents[agentAddrs[i]].active) revert AgentNotActive();
        }

        uint256 pricePerToken = tokenPricePerCurrency[fiatCurrency];
        if (pricePerToken == 0) revert CurrencyNotSupported();

        uint256 offerId = ++offerCounter;

        Offer storage o = offers[offerId];
        o.id = offerId;
        o.owner = msg.sender;
        o.offerType = offerType;
        o.amountAvailable = amountAvailable;
        o.minAmount = minAmount;
        o.pricePerToken = pricePerToken;
        o.fiatCurrency = fiatCurrency;
        o.flatFee = flatFee;
        o.active = true;
        o.metadataCID = metadataCID;
        o.createdAt = block.timestamp;
        for (uint256 j = 0; j < agentAddrs.length; j++) {
            o.agentAddresses.push(agentAddrs[j]);
        }

        userOffers[msg.sender].push(offerId);

        // Populate reverse mapping: agent → offerIds
        for (uint256 i = 0; i < agentAddrs.length; i++) {
            agentOffers[agentAddrs[i]].push(offerId);
        }

        emit OfferCreated(
            offerId,
            msg.sender,
            offerType,
            amountAvailable,
            minAmount,
            pricePerToken,
            fiatCurrency,
            flatFee,
            metadataCID
        );

        return offerId;
    }

    /// @notice Add an agent to an existing offer (only the offer owner can call).
    /// @dev Lets a provider opt into agents that registered after the offer was
    ///      created, without removing and recreating it. The agent must be
    ///      registered and active and not already linked to the offer.
    function addAgentToOffer(uint256 offerId, address agent) external {
        Offer storage o = offers[offerId];
        if (o.id == 0) revert OfferNotFound();
        if (o.owner != msg.sender) revert NotOfferOwner();
        if (isOfferExpired(offerId)) revert OfferExpiredError();
        if (agents[agent].wallet == address(0)) revert AgentNotRegistered();
        if (!agents[agent].active) revert AgentNotActive();

        address[] storage list = o.agentAddresses;
        for (uint256 i = 0; i < list.length; i++) {
            if (list[i] == agent) revert AgentAlreadyOnOffer();
        }

        list.push(agent);
        agentOffers[agent].push(offerId);

        emit OfferAgentAdded(offerId, agent);
    }

    /// @notice Remove an offer (only the offer owner can call). Hard deletes from storage.
    function removeOffer(uint256 offerId) external {
        if (offers[offerId].id == 0) revert OfferNotFound();
        if (offers[offerId].owner != msg.sender) revert NotOfferOwner();
        _deleteOffer(offerId);
        emit OfferRemoved(offerId, msg.sender);
    }

    /// @notice Prune a single expired offer. Anyone can call.
    /// @dev Reverts if the offer does not exist or has not yet expired.
    function pruneExpiredOffer(uint256 offerId) public {
        if (offers[offerId].id == 0) revert OfferNotFound();
        if (!isOfferExpired(offerId)) revert OfferNotExpired();
        address owner = offers[offerId].owner;
        _deleteOffer(offerId);
        emit OfferPruned(offerId, owner);
    }

    /// @notice Batch prune expired offers. Anyone can call. Silently skips ids
    ///         that don't exist or aren't yet expired so callers can pass a best-effort list.
    function pruneExpiredOffers(uint256[] calldata offerIds) external {
        for (uint256 i = 0; i < offerIds.length; i++) {
            uint256 offerId = offerIds[i];
            if (offers[offerId].id != 0 && isOfferExpired(offerId)) {
                address owner = offers[offerId].owner;
                _deleteOffer(offerId);
                emit OfferPruned(offerId, owner);
            }
        }
    }

    // ═══════════════════════════════════════════
    // ═══ OFFER VIEW FUNCTIONS ═══
    // ═══════════════════════════════════════════

    /// @notice Check if an offer is expired (older than OFFER_TTL)
    function isOfferExpired(uint256 offerId) public view returns (bool) {
        if (offers[offerId].id == 0) return true;
        return block.timestamp > offers[offerId].createdAt + OFFER_TTL;
    }

    /// @notice Get single offer by ID (reverts if deleted)
    function getOffer(uint256 offerId) external view returns (Offer memory) {
        if (offers[offerId].id == 0) revert OfferNotFound();
        return offers[offerId];
    }

    function getUserOffers(address user) external view returns (uint256[] memory) {
        return userOffers[user];
    }

    function getOfferCount() external view returns (uint256) {
        return offerCounter;
    }

    /// @notice Get active (non-expired) offer IDs linked to an agent
    function getOffersByAgent(address agent) external view returns (uint256[] memory) {
        uint256[] storage raw = agentOffers[agent];
        uint256 activeCount = 0;
        for (uint256 i = 0; i < raw.length; i++) {
            if (raw[i] != 0 && offers[raw[i]].id != 0 && !isOfferExpired(raw[i])) {
                activeCount++;
            }
        }
        uint256[] memory result = new uint256[](activeCount);
        uint256 idx = 0;
        for (uint256 i = 0; i < raw.length; i++) {
            if (raw[i] != 0 && offers[raw[i]].id != 0 && !isOfferExpired(raw[i])) {
                result[idx++] = raw[i];
            }
        }
        return result;
    }

    /// @notice Get every offerId currently past its TTL but still in storage.
    /// @dev Frontends call this then pass the result to `pruneExpiredOffers`.
    function getExpiredOfferIds() external view returns (uint256[] memory) {
        uint256 count = offerCounter;
        if (count == 0) return new uint256[](0);

        uint256 expiredCount = 0;
        for (uint256 i = 1; i <= count; i++) {
            if (offers[i].id != 0 && isOfferExpired(i)) {
                expiredCount++;
            }
        }

        uint256[] memory result = new uint256[](expiredCount);
        uint256 idx = 0;
        for (uint256 i = 1; i <= count; i++) {
            if (offers[i].id != 0 && isOfferExpired(i)) {
                result[idx++] = i;
            }
        }
        return result;
    }

    /// @notice Get all active (non-deleted, non-expired) offers
    function getAllOffers() external view returns (Offer[] memory) {
        uint256 count = offerCounter;
        if (count == 0) return new Offer[](0);

        // Count active offers first
        uint256 activeCount = 0;
        for (uint256 i = 1; i <= count; i++) {
            if (offers[i].id != 0 && !isOfferExpired(i)) {
                activeCount++;
            }
        }

        Offer[] memory result = new Offer[](activeCount);
        uint256 idx = 0;
        for (uint256 i = 1; i <= count; i++) {
            if (offers[i].id != 0 && !isOfferExpired(i)) {
                result[idx++] = offers[i];
            }
        }
        return result;
    }

    // ═══════════════════════════════════════════
    // ═══ ESCROW FUNCTIONS ═══
    // ═══════════════════════════════════════════

    /// @notice Lock native tokens (PAS) for a trade. Either party can lock.
    /// @param counterparty Address that will receive funds after confirmation
    /// @param offerId Link to an existing offer (0 for ad-hoc). Validates amount against offer.
    /// @param agent Agent address for witnessed trade (address(0) for direct)
    function lockTrade(
        address counterparty,
        uint256 offerId,
        address agent
    ) external payable noReentrant returns (uint256) {
        if (counterparty == address(0) || counterparty == msg.sender) revert InvalidCounterparty();
        if (msg.value == 0) revert InvalidAmount();

        // Validate agent if provided
        if (agent != address(0)) {
            if (agents[agent].wallet == address(0)) revert AgentNotRegistered();
            if (!agents[agent].active) revert AgentNotActive();
        }

        // Validate amount against offer if linked
        if (offerId > 0) {
            if (offers[offerId].id == 0) revert OfferNotFound();
            if (isOfferExpired(offerId)) revert OfferExpiredError();
            if (msg.value < offers[offerId].minAmount) revert InvalidAmount();
            if (msg.value > offers[offerId].amountAvailable) revert InvalidAmount();
        }

        uint256 tradeId = ++tradeCounter;

        Trade storage t = trades[tradeId];
        t.id = tradeId;
        t.offerId = offerId;
        t.locker = msg.sender;
        t.counterparty = counterparty;
        t.agent = agent;
        t.amount = msg.value;
        t.state = TradeState.LOCKED;
        t.lockedAt = block.timestamp;

        userTrades[msg.sender].push(tradeId);
        userTrades[counterparty].push(tradeId);
        if (agent != address(0)) {
            userTrades[agent].push(tradeId);
        }

        emit TradeLocked(tradeId, msg.sender, counterparty, agent, msg.value);
        return tradeId;
    }

    /// @notice Confirm handover for DIRECT trades only (no agent).
    /// @dev Both locker + counterparty must confirm → state = COMPLETED.
    ///      For agent trades, use confirmCashReceived() instead.
    function confirmTrade(uint256 tradeId) external noReentrant {
        Trade storage t = trades[tradeId];
        if (t.id == 0) revert TradeNotFound();
        if (t.agent != address(0)) revert OnlyDirectTrades();
        if (t.state != TradeState.LOCKED) revert TradeNotLocked();
        if (block.timestamp > t.lockedAt + CONFIRMATION_TIMEOUT) revert TimeoutReached();

        if (msg.sender == t.locker) {
            if (t.lockerConfirmed) revert AlreadyConfirmed();
            t.lockerConfirmed = true;
        } else if (msg.sender == t.counterparty) {
            if (t.counterpartyConfirmed) revert AlreadyConfirmed();
            t.counterpartyConfirmed = true;
        } else {
            revert NotTradeParticipant();
        }

        emit TradeConfirmed(tradeId, msg.sender);

        // Both confirmed → complete the trade
        if (t.lockerConfirmed && t.counterpartyConfirmed) {
            t.state = TradeState.COMPLETED;

            // Reduce offer's available amount
            _reduceOfferAmount(t.offerId, t.amount);

            (bool success, ) = payable(t.counterparty).call{value: t.amount}("");
            if (!success) revert TransferFailed();
            emit TradeReleased(tradeId, t.counterparty, t.amount);
            emit TradeCompleted(tradeId);
        }
    }

    /// @notice Agent confirms cash received from buyer → tokens release to buyer.
    /// @dev Only for agent-mediated trades. Sets pickupDeadline using agent.holdHours;
    ///      hours past the deadline accrue extraHourFee in cash (off-chain).
    function confirmCashReceived(uint256 tradeId) external noReentrant {
        Trade storage t = trades[tradeId];
        if (t.id == 0) revert TradeNotFound();
        if (t.agent == address(0)) revert OnlyAgentTrades();
        if (t.state != TradeState.LOCKED) revert TradeNotLocked();
        if (msg.sender != t.agent) revert NotAgent();
        if (block.timestamp > t.lockedAt + CONFIRMATION_TIMEOUT) revert TimeoutReached();

        t.state = TradeState.RELEASED;
        t.pickupDeadline = block.timestamp + uint256(agents[t.agent].holdHours) * 1 hours;

        // Reduce offer's available amount
        _reduceOfferAmount(t.offerId, t.amount);

        // Transfer tokens to buyer
        (bool success, ) = payable(t.counterparty).call{value: t.amount}("");
        if (!success) revert TransferFailed();

        emit CashReceived(tradeId, msg.sender);
        emit TradeReleased(tradeId, t.counterparty, t.amount);
    }

    /// @notice Provider confirms cash pickup from agent → trade complete.
    /// @dev Provider must confirm BEFORE receiving cash. Agent gives cash after seeing COMPLETED.
    function confirmPickup(uint256 tradeId) external {
        Trade storage t = trades[tradeId];
        if (t.id == 0) revert TradeNotFound();
        if (t.agent == address(0)) revert OnlyAgentTrades();
        if (t.state != TradeState.RELEASED) revert TradeNotReleased();
        if (msg.sender != t.locker) revert NotLocker();

        t.state = TradeState.COMPLETED;

        emit PickupConfirmed(tradeId, msg.sender);
        emit TradeCompleted(tradeId);
    }

    /// @notice Attach a Bulletin Chain CID with handoff evidence (e.g. video) to a trade.
    /// @dev Either trade party can set this. Last writer wins. CID is opaque on-chain;
    ///      readers fetch the underlying file via fetchFromHostStorage(cid).
    function setEvidenceCID(uint256 tradeId, string calldata cid) external {
        Trade storage t = trades[tradeId];
        if (t.id == 0) revert TradeNotFound();
        if (msg.sender != t.locker && msg.sender != t.counterparty) revert NotTradeParticipant();
        if (bytes(cid).length == 0) revert InvalidEvidenceCID();

        t.evidenceCID = cid;
        emit EvidenceAttached(tradeId, msg.sender, cid);
    }

    /// @notice Request mutual cancel. Both locker and counterparty must request.
    /// @dev When both agree, funds return to locker. Agent not required for cancel.
    function requestCancel(uint256 tradeId) external noReentrant {
        Trade storage t = trades[tradeId];
        if (t.id == 0) revert TradeNotFound();
        if (t.state != TradeState.LOCKED) revert TradeNotLocked();

        if (msg.sender == t.locker) {
            if (t.lockerCancelRequested) revert AlreadyCancelRequested();
            t.lockerCancelRequested = true;
        } else if (msg.sender == t.counterparty) {
            if (t.counterpartyCancelRequested) revert AlreadyCancelRequested();
            t.counterpartyCancelRequested = true;
        } else {
            revert NotTradeParticipant();
        }

        emit TradeCancelRequested(tradeId, msg.sender);

        // If both agreed, cancel and refund locker
        if (t.lockerCancelRequested && t.counterpartyCancelRequested) {
            t.state = TradeState.CANCELLED;
            (bool success, ) = payable(t.locker).call{value: t.amount}("");
            if (!success) revert TransferFailed();
            emit TradeCancelled(tradeId, t.locker, t.amount);
        }
    }

    /// @notice Refund locker after timeout (anyone can call, funds always go to locker)
    function refundTrade(uint256 tradeId) external noReentrant {
        Trade storage t = trades[tradeId];
        if (t.id == 0) revert TradeNotFound();
        if (t.state != TradeState.LOCKED) revert TradeNotLocked();
        if (block.timestamp <= t.lockedAt + CONFIRMATION_TIMEOUT) revert TimeoutNotReached();

        t.state = TradeState.REFUNDED;
        (bool success, ) = payable(t.locker).call{value: t.amount}("");
        if (!success) revert TransferFailed();
        emit TradeRefunded(tradeId, t.locker, t.amount);
    }

    // ═══ TRADE VIEW FUNCTIONS ═══

    /// @notice Get trade by ID
    function getTrade(uint256 tradeId) external view returns (Trade memory) {
        if (trades[tradeId].id == 0) revert TradeNotFound();
        return trades[tradeId];
    }

    /// @notice Get all trade IDs for a user (as locker, counterparty, or agent)
    function getUserTrades(address user) external view returns (uint256[] memory) {
        return userTrades[user];
    }

    /// @notice Get trade count
    function getTradeCount() external view returns (uint256) {
        return tradeCounter;
    }

    // ═══════════════════════════════════════════
    // ═══ INTERNAL HELPERS ═══
    // ═══════════════════════════════════════════

    /// @dev Internal hard-delete used by removeOffer and prune flows.
    function _deleteOffer(uint256 offerId) internal {
        address owner = offers[offerId].owner;
        address[] memory offerAgents = offers[offerId].agentAddresses;

        for (uint256 i = 0; i < offerAgents.length; i++) {
            _removeFromUintArray(agentOffers[offerAgents[i]], offerId);
        }

        _removeFromUintArray(userOffers[owner], offerId);

        delete offers[offerId];
    }

    /// @dev Sweep a single user's expired offers. Called opportunistically from createOffer.
    /// @dev Walks userOffers[user] in reverse so swap-and-pop deletions don't skip indices.
    function _sweepUserExpiredOffers(address user) internal {
        uint256[] storage ids = userOffers[user];
        for (uint256 i = ids.length; i > 0; i--) {
            uint256 offerId = ids[i - 1];
            if (offers[offerId].id != 0 && isOfferExpired(offerId)) {
                _deleteOffer(offerId);
                emit OfferPruned(offerId, user);
            }
        }
    }

    /// @dev Check that an agent has no active trades (LOCKED or RELEASED)
    function _requireNoActiveTrades(address agentAddr) internal view {
        uint256[] storage agentTradeIds = userTrades[agentAddr];
        for (uint256 i = 0; i < agentTradeIds.length; i++) {
            Trade storage t = trades[agentTradeIds[i]];
            if (t.agent == agentAddr && (t.state == TradeState.LOCKED || t.state == TradeState.RELEASED)) {
                revert AgentHasActiveTrades();
            }
        }
    }

    /// @dev Reduce offer's available amount after trade completion
    function _reduceOfferAmount(uint256 offerId, uint256 amount) internal {
        if (offerId > 0 && offers[offerId].id != 0) {
            if (amount >= offers[offerId].amountAvailable) {
                offers[offerId].amountAvailable = 0;
            } else {
                offers[offerId].amountAvailable -= amount;
            }
        }
    }

    /// @dev Remove a value from a uint256[] storage array (swap-and-pop)
    function _removeFromUintArray(uint256[] storage arr, uint256 value) internal {
        for (uint256 i = 0; i < arr.length; i++) {
            if (arr[i] == value) {
                arr[i] = arr[arr.length - 1];
                arr.pop();
                return;
            }
        }
    }

    /// @dev Remove an address from an address[] storage array (swap-and-pop)
    function _removeFromAddressArray(address[] storage arr, address value) internal {
        for (uint256 i = 0; i < arr.length; i++) {
            if (arr[i] == value) {
                arr[i] = arr[arr.length - 1];
                arr.pop();
                return;
            }
        }
    }
}
